from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime

from tis_agent.agent_config import load_agent_config, match_fixed_answer
from tis_agent.analytics import (
    OUTCOME_ERROR,
    OUTCOME_FIXED_ANSWER,
    OUTCOME_LOW_CONFIDENCE,
    OUTCOME_NO_EVIDENCE,
    OUTCOME_SUCCESS,
    classify_outcome,
)
from tis_agent.clients import embed_texts, make_openai, make_supabase
from tis_agent.config import Settings, get_settings
from tis_agent.reply_format import format_whatsapp_reply, strip_empty_source_line
from tis_agent.ical_text import chunks_from_formatted_calendar
from tis_agent.temporal import (
    DateRange,
    TemporalQuery,
    chunk_overlaps_range,
    grounding_instruction,
    is_sync_window_stub,
    is_whats_on_question,
    parse_temporal,
    retrieval_queries,
    tokyo_today,
)

EVENT_LOOKUP_SIMILARITY_FLOOR = 0.32
_EVENT_TITLE_RE = re.compile(r"^Event:\s+(.+)$", re.MULTILINE)
_STARTS_TIME_RE = re.compile(
    r"^Starts:\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?",
    re.MULTILINE,
)
_ROTATION_DAY_RE = re.compile(r"^day\s*[1-6]$", re.IGNORECASE)


_SCHOOL_START_RE = re.compile(
    r"(?i)\b(?:what time does school start|when does school start|school start time|"
    r"när börjar skolan|vad dags börjar skolan)\b"
)


def _normalize_retrieval_query(question: str) -> str:
    """Light spelling/spacing fixes so embeddings match handbook wording better."""
    text = question.strip()
    replacements = (
        (r"\bschoolbuses?\b", "school bus"),
        (r"\bschool-bus\b", "school bus"),
        (r"\bskolbussen\b", "skolbuss"),
        (r"\bstrart\b", "start"),
    )
    for pattern, repl in replacements:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    return text


def is_school_start_question(question: str) -> bool:
    return bool(_SCHOOL_START_RE.search(question or ""))


def _reply_language(question: str) -> str:
    """Rough language tag for templated replies."""
    lower = question.lower()
    if any(ch in question for ch in "åäöÅÄÖ"):
        return "sv"
    swedish_hints = (
        " hur ", " vad ", " när ", " var ", " vem ", " kan ", " jag ", " är ", " och ",
        " för ", " att ", " om ", " inte ", " skola", " frånvaro", " barn", " dig ",
    )
    padded = f" {lower} "
    if any(h in padded for h in swedish_hints):
        return "sv"
    return "en"


def no_evidence_reply(question: str) -> str:
    if _reply_language(question) == "sv":
        return "Jag kunde inte hitta ett officiellt TIS-dokument som svarar på det."
    return "I couldn't find an official TIS source that answers that."


def _parse_date_field(value: object) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value)[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


@dataclass(frozen=True)
class Evidence:
    content: str
    section_title: str | None
    page_start: int | None
    page_end: int | None
    document_title: str
    similarity: float
    chunk_id: str | None = None
    document_id: str | None = None
    source_type: str | None = None
    start_date: date | None = None
    end_date: date | None = None


@dataclass(frozen=True)
class AnswerResult:
    reply: str
    language: str
    outcome: str
    evidence_count: int
    top_similarity: float | None
    document_titles: list[str] = field(default_factory=list)


@dataclass
class Retrieval:
    evidence: list[Evidence]
    date_lookup_ok: bool = False
    used_vector: bool = False


def _evidence_from_row(row: dict, *, handbook_title: str) -> Evidence:
    return Evidence(
        content=row["content"],
        section_title=row.get("section_title"),
        page_start=row.get("page_start"),
        page_end=row.get("page_end"),
        document_title=row.get("document_title") or handbook_title,
        similarity=float(row.get("similarity") or 0),
        chunk_id=str(row["id"]) if row.get("id") else None,
        document_id=str(row["document_id"]) if row.get("document_id") else None,
        source_type=row.get("source_type"),
        start_date=_parse_date_field(row.get("start_date")),
        end_date=_parse_date_field(row.get("end_date")),
    )


def _nested_document_fields(row: dict) -> dict:
    """Flatten PostgREST `documents(...)` embeds used in table fallbacks."""
    docs = row.get("documents")
    if isinstance(docs, dict):
        row = dict(row)
        row.setdefault("document_title", docs.get("title"))
        row.setdefault("source_type", docs.get("source_type"))
    return row


def _vector_retrieve(
    settings: Settings,
    queries: list[str],
    *,
    match_count: int,
) -> list[Evidence]:
    openai = make_openai(settings)
    supabase = make_supabase(settings)
    embeddings = embed_texts(openai, settings.embedding_model, queries)
    evidence: list[Evidence] = []
    for embedding in embeddings:
        response = supabase.rpc(
            "match_chunks",
            {
                "query_embedding": embedding,
                "match_count": match_count,
            },
        ).execute()
        for row in response.data or []:
            evidence.append(_evidence_from_row(row, handbook_title=settings.handbook_title))
    return evidence


def _with_source_type(item: Evidence, source_type: str | None) -> Evidence:
    if not source_type or item.source_type:
        return item
    return Evidence(
        content=item.content,
        section_title=item.section_title,
        page_start=item.page_start,
        page_end=item.page_end,
        document_title=item.document_title,
        similarity=item.similarity,
        chunk_id=item.chunk_id,
        document_id=item.document_id,
        source_type=source_type,
        start_date=item.start_date,
        end_date=item.end_date,
    )


def _attach_source_types(settings: Settings, evidence: list[Evidence]) -> list[Evidence]:
    """Fill source_type from documents when match_chunks does not return it."""
    missing_ids = [
        item.document_id
        for item in evidence
        if item.document_id and not item.source_type
    ]
    if not missing_ids:
        return evidence
    try:
        response = (
            make_supabase(settings)
            .table("documents")
            .select("id, source_type, title")
            .in_("id", list(dict.fromkeys(missing_ids)))
            .execute()
        )
    except Exception:
        return evidence
    by_id = {str(row["id"]): row for row in response.data or []}
    out: list[Evidence] = []
    for item in evidence:
        row = by_id.get(item.document_id or "")
        source_type = item.source_type or (row.get("source_type") if row else None)
        if not source_type and (
            "calendar" in item.document_title.lower()
            or "parent calendar" in item.document_title.lower()
        ):
            source_type = "calendar"
        out.append(_with_source_type(item, source_type))
    return out


def _as_calendar_hit(item: Evidence) -> Evidence:
    return Evidence(
        content=item.content,
        section_title=item.section_title,
        page_start=item.page_start,
        page_end=item.page_end,
        document_title=item.document_title,
        similarity=0.99,
        chunk_id=item.chunk_id,
        document_id=item.document_id,
        source_type="calendar",
        start_date=item.start_date,
        end_date=item.end_date,
    )


def _expand_calendar_blobs(items: list[Evidence], rng: DateRange) -> list[Evidence]:
    """Split a leftover year-blob calendar chunk into per-event rows for the asked dates."""
    expanded: list[Evidence] = []
    for item in items:
        event_count = item.content.count("Event:")
        if item.source_type != "calendar" or event_count <= 1:
            expanded.append(item)
            continue
        for chunk in chunks_from_formatted_calendar(item.content):
            if not chunk_overlaps_range(
                chunk.content,
                rng,
                start_date=chunk.start_date,
                end_date=chunk.end_date,
                document_title=item.document_title,
            ):
                continue
            expanded.append(
                Evidence(
                    content=chunk.content,
                    section_title=chunk.section_title,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    document_title=item.document_title,
                    similarity=0.99,
                    chunk_id=None,
                    document_id=item.document_id,
                    source_type="calendar",
                    start_date=chunk.start_date,
                    end_date=chunk.end_date,
                )
            )
    return expanded


def _filter_overlapping(
    settings: Settings,
    rows: list[dict],
    rng: DateRange,
    *,
    force_calendar: bool = False,
) -> list[Evidence]:
    evidence: list[Evidence] = []
    for row in rows:
        row = _nested_document_fields(row)
        item = _evidence_from_row(row, handbook_title=settings.handbook_title)
        if force_calendar:
            item = _as_calendar_hit(item)
        if is_sync_window_stub(item.content, document_title=item.document_title):
            continue
        if chunk_overlaps_range(
            item.content,
            rng,
            start_date=item.start_date,
            end_date=item.end_date,
            document_title=item.document_title,
        ):
            evidence.append(item)
    return _expand_calendar_blobs(evidence, rng)


def _calendar_retrieve(
    settings: Settings,
    temporal: TemporalQuery,
) -> tuple[list[Evidence], bool]:
    """Load parent-calendar events that overlap the asked dates (not the whole year)."""
    if temporal.kind != "date_anchored" or temporal.date_range is None:
        return [], False
    rng = temporal.date_range
    select_cols = (
        "id, document_id, content, section_title, page_start, page_end, "
        "chunk_index, start_date, end_date, event_type, "
        "documents!inner(title, source_type)"
    )
    supabase = make_supabase(settings)

    try:
        response = (
            supabase.table("chunks")
            .select(select_cols)
            .eq("documents.source_type", "calendar")
            .not_.is_("start_date", "null")
            .lte("start_date", rng.end.isoformat())
            .or_(
                f"end_date.gte.{rng.start.isoformat()},end_date.is.null"
            )
            .limit(80)
            .execute()
        )
        return _filter_overlapping(settings, response.data or [], rng, force_calendar=True), True
    except Exception:
        pass

    try:
        response = (
            supabase.table("chunks")
            .select(select_cols)
            .eq("documents.source_type", "calendar")
            .limit(400)
            .execute()
        )
        return _filter_overlapping(settings, response.data or [], rng, force_calendar=True), True
    except Exception:
        return [], False


def _date_retrieve(
    settings: Settings,
    temporal: TemporalQuery,
) -> tuple[list[Evidence], bool]:
    """Load any dated chunk (calendar, bulletin, handbook, web) overlapping the asked dates."""
    if temporal.kind != "date_anchored" or temporal.date_range is None:
        return [], False
    rng = temporal.date_range
    supabase = make_supabase(settings)
    try:
        response = (
            supabase.rpc(
                "chunks_overlapping_dates",
                {
                    "filter_start": rng.start.isoformat(),
                    "filter_end": rng.end.isoformat(),
                    "match_count": 40,
                },
            )
            .execute()
        )
        return _filter_overlapping(settings, response.data or [], rng), True
    except Exception:
        pass

    select_cols = (
        "id, document_id, content, section_title, page_start, page_end, "
        "chunk_index, start_date, end_date, event_type, "
        "documents!inner(title, source_type)"
    )
    try:
        response = (
            supabase.table("chunks")
            .select(select_cols)
            .not_.is_("start_date", "null")
            .lte("start_date", rng.end.isoformat())
            .or_(f"end_date.gte.{rng.start.isoformat()},end_date.is.null")
            .limit(80)
            .execute()
        )
        return _filter_overlapping(settings, response.data or [], rng), True
    except Exception:
        return [], False


def _merge_evidence(batches: list[list[Evidence]]) -> list[Evidence]:
    by_key: dict[str, Evidence] = {}
    for batch in batches:
        for item in batch:
            key = item.chunk_id or f"{item.document_title}:{item.content[:120]}"
            existing = by_key.get(key)
            if existing is None or item.similarity > existing.similarity:
                by_key[key] = item
    return list(by_key.values())


def _is_temporally_relevant(item: Evidence, temporal: TemporalQuery) -> bool:
    if is_sync_window_stub(item.content, document_title=item.document_title):
        return False
    if temporal.kind != "date_anchored" or temporal.date_range is None:
        return True
    return chunk_overlaps_range(
        item.content,
        temporal.date_range,
        start_date=item.start_date,
        end_date=item.end_date,
        document_title=item.document_title,
    )


def _rerank(evidence: list[Evidence], temporal: TemporalQuery) -> list[Evidence]:
    def sort_key(item: Evidence) -> tuple[int, int, int, float]:
        overlap = 1 if _is_temporally_relevant(item, temporal) else 0
        calendar = 1 if item.source_type == "calendar" else 0
        bulletin = 1 if item.source_type == "bulletin" else 0
        return (overlap, calendar, bulletin, item.similarity)

    return sorted(evidence, key=sort_key, reverse=True)


def _event_label(item: Evidence) -> str:
    title = (item.section_title or "").strip()
    if not title:
        match = _EVENT_TITLE_RE.search(item.content or "")
        title = match.group(1).strip() if match else (item.document_title or "Event")
    starts = _STARTS_TIME_RE.search(item.content or "")
    if starts and starts.group(2):
        return f"{title} ({starts.group(2)})"
    return title


def is_rotation_day(item: Evidence) -> bool:
    """True for TIS 6-day rotation labels (Day 1–6), which are not special events."""
    label = _event_label(item)
    if "(" in label:
        label = label.split("(", 1)[0]
    return bool(_ROTATION_DAY_RE.fullmatch(label.strip()))


def _normalize_event_name(text: str) -> str:
    text = (text or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _event_name_keys(items: list[Evidence]) -> list[str]:
    keys: list[str] = []
    for item in items:
        if is_rotation_day(item):
            continue
        label = _event_label(item).strip()
        if "(" in label:
            label = label.split("(", 1)[0].strip()
        normalized = _normalize_event_name(label)
        if len(normalized) < 6:
            continue
        keys.append(normalized)
    return keys


def _mentions_event(item: Evidence, names: list[str]) -> bool:
    if not names:
        return False
    text = _normalize_event_name(f"{item.section_title or ''} {item.content}")
    return any(name in text for name in names)


def select_dated_evidence(
    merged: list[Evidence],
    temporal: TemporalQuery,
) -> list[Evidence]:
    """Calendar events for the asked dates, plus handbook/bulletin/web that support them."""
    overlapping = [item for item in merged if _is_temporally_relevant(item, temporal)]
    calendar_special = [
        item
        for item in overlapping
        if item.source_type == "calendar" and not is_rotation_day(item)
    ]
    names = _event_name_keys(calendar_special)
    supporting: list[Evidence] = []
    seen: set[str] = set()
    for item in merged:
        if item.source_type == "calendar":
            continue
        keep = _is_temporally_relevant(item, temporal) or _mentions_event(item, names)
        if not keep:
            continue
        key = item.chunk_id or f"{item.document_title}:{item.content[:80]}"
        if key in seen:
            continue
        seen.add(key)
        supporting.append(item)
    return _rerank([*calendar_special, *supporting], temporal)


def has_non_calendar_context(evidence: list[Evidence]) -> bool:
    return any(item.source_type != "calendar" for item in evidence)


def _format_range_label(rng: DateRange, language: str) -> str:
    if rng.start != rng.end:
        if language == "sv":
            return f"{rng.start.isoformat()} till {rng.end.isoformat()}"
        return rng.label()
    day = rng.start
    weekday = day.strftime("%A")
    month = day.strftime("%B")
    if language == "sv":
        return f"{weekday} {day.day} {month} {day.year}"
    return f"{weekday} {day.day} {month} {day.year}"


def format_schedule_reply(
    evidence: list[Evidence],
    temporal: TemporalQuery,
    language: str,
) -> str:
    """Deterministic calendar answer — no LLM round-trip."""
    rng = temporal.date_range
    assert rng is not None
    calendar_items = [
        item
        for item in evidence
        if item.source_type == "calendar" and not is_rotation_day(item)
    ]
    seen: set[str] = set()
    unique: list[Evidence] = []
    for item in calendar_items:
        key = (item.section_title or "") + "|" + item.content[:80]
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    unique.sort(key=lambda item: (item.start_date or rng.start, _event_label(item)))
    label = _format_range_label(rng, language)
    source = "_Source: TIS Parent Calendar_"
    if language == "sv":
        source = "_Källa: TIS Parent Calendar_"

    if not unique:
        if language == "sv":
            if rng.start == rng.end:
                return (
                    f"På TIS-föräldrakalendern står inget särskilt evenemang idag, {label}.\n\n"
                    f"{source}"
                )
            return (
                f"På TIS-föräldrakalendern står inget särskilt evenemang {label}.\n\n"
                f"{source}"
            )
        if rng.start == rng.end:
            return (
                f"The TIS Parent Calendar doesn't list a special event for today, {label}.\n\n"
                f"{source}"
            )
        return (
            f"The TIS Parent Calendar doesn't list a special event for {label}.\n\n"
            f"{source}"
        )

    bullets = "\n".join(f"• {_event_label(item)}" for item in unique[:12])
    if language == "sv":
        heading = (
            f"På TIS-föräldrakalendern idag ({label}):"
            if rng.start == rng.end
            else f"På TIS-föräldrakalendern {label}:"
        )
    else:
        heading = (
            f"Today on the TIS Parent Calendar ({label}):"
            if rng.start == rng.end
            else f"On the TIS Parent Calendar for {label}:"
        )
    return f"{heading}\n\n{bullets}\n\n{source}"


def retrieve(
    settings: Settings,
    question: str,
    *,
    match_count: int = 8,
    temporal: TemporalQuery | None = None,
    today: date | None = None,
) -> Retrieval:
    today = today or tokyo_today()
    temporal = temporal or parse_temporal(question, today=today)
    queries = [_normalize_retrieval_query(q) for q in retrieval_queries(temporal)]
    if is_school_start_question(question):
        queries.append(
            "official school start time 8:10 classes begin campus opening hours"
        )

    if temporal.kind == "none":
        return Retrieval(
            evidence=_vector_retrieve(settings, queries[:2], match_count=match_count),
            used_vector=True,
        )

    calendar_hits, calendar_ok = _calendar_retrieve(settings, temporal)
    date_hits, date_ok = _date_retrieve(settings, temporal)
    vector_hits = _vector_retrieve(settings, queries[:2], match_count=match_count)
    merged = _attach_source_types(
        settings,
        _merge_evidence([calendar_hits, date_hits, vector_hits]),
    )
    merged = [
        item
        for item in merged
        if not is_sync_window_stub(item.content, document_title=item.document_title)
    ]

    if temporal.kind == "event_date_lookup":
        return Retrieval(
            evidence=_rerank(merged, temporal)[: max(match_count, 12)],
            date_lookup_ok=calendar_ok or date_ok,
            used_vector=True,
        )

    selected = select_dated_evidence(merged, temporal)
    return Retrieval(
        evidence=selected[: max(match_count, 12)],
        date_lookup_ok=calendar_ok or date_ok,
        used_vector=True,
    )


def format_evidence(evidence: list[Evidence]) -> str:
    blocks = []
    for i, item in enumerate(evidence, start=1):
        pages = ""
        if item.page_start and item.page_end:
            pages = (
                f"p. {item.page_start}"
                if item.page_start == item.page_end
                else f"pp. {item.page_start}-{item.page_end}"
            )
        header = f"[{i}] {item.document_title}"
        if item.source_type:
            header += f" [{item.source_type}]"
        if item.section_title:
            header += f" — {item.section_title}"
        if pages:
            header += f" ({pages})"
        if item.start_date:
            end = item.end_date or item.start_date
            if end == item.start_date:
                header += f" | date={item.start_date.isoformat()}"
            else:
                header += f" | dates={item.start_date.isoformat()}..{end.isoformat()}"
        header += f" | similarity={item.similarity:.3f}"
        blocks.append(f"{header}\n{item.content}")
    return "\n\n".join(blocks)


def _passes_grounding(
    evidence: list[Evidence],
    temporal: TemporalQuery,
    config,
) -> bool:
    if not evidence:
        return False
    if temporal.kind == "date_anchored":
        return True
    top_sim = max(item.similarity for item in evidence)
    if top_sim >= config.similarity_threshold:
        return True
    if temporal.kind == "event_date_lookup":
        return any(
            item.source_type == "calendar" and item.similarity >= EVENT_LOOKUP_SIMILARITY_FLOOR
            for item in evidence
        )
    return False


def answer_question(
    question: str,
    *,
    settings: Settings | None = None,
    history: list[dict[str, str]] | None = None,
) -> AnswerResult:
    settings = settings or get_settings()
    language = _reply_language(question)
    config = load_agent_config(settings)
    today = tokyo_today()
    temporal = parse_temporal(question, today=today)

    fixed = match_fixed_answer(question, config)
    if fixed:
        _key, reply = fixed
        return AnswerResult(
            reply=reply,
            language=language,
            outcome=OUTCOME_FIXED_ANSWER,
            evidence_count=0,
            top_similarity=None,
        )

    try:
        retrieval = retrieve(settings, question, temporal=temporal, today=today)
    except Exception:
        return AnswerResult(
            reply=(
                "Sorry — I hit a temporary error looking that up. "
                "Please try again in a moment."
            ),
            language=language,
            outcome=OUTCOME_ERROR,
            evidence_count=0,
            top_similarity=None,
        )

    evidence = retrieval.evidence
    titles = list(dict.fromkeys(e.document_title for e in evidence))
    top_sim = max((e.similarity for e in evidence), default=None)

    if (
        temporal.kind == "date_anchored"
        and is_whats_on_question(question)
        and retrieval.date_lookup_ok
        and not has_non_calendar_context(evidence)
    ):
        reply = format_whatsapp_reply(
            format_schedule_reply(evidence, temporal, language),
            has_evidence=True,
        )
        if "TIS Parent Calendar" not in titles:
            titles = ["TIS Parent Calendar", *titles]
        return AnswerResult(
            reply=reply,
            language=language,
            outcome=OUTCOME_SUCCESS,
            evidence_count=len(evidence),
            top_similarity=top_sim,
            document_titles=titles,
        )

    if not evidence:
        return AnswerResult(
            reply=strip_empty_source_line(config.no_evidence_message),
            language=language,
            outcome=OUTCOME_NO_EVIDENCE,
            evidence_count=0,
            top_similarity=None,
        )

    if config.strict_grounding and not _passes_grounding(evidence, temporal, config):
        return AnswerResult(
            reply=strip_empty_source_line(config.no_evidence_message),
            language=language,
            outcome=OUTCOME_LOW_CONFIDENCE,
            evidence_count=len(evidence),
            top_similarity=top_sim,
            document_titles=titles,
        )

    openai = make_openai(settings)
    messages = [
        {
            "role": "system",
            "content": config.system_prompt.format(today=today.isoformat()),
        }
    ]
    if history:
        messages.extend(history[-6:])

    extra = grounding_instruction(temporal)
    extra_block = f"{extra}\n\n" if extra else ""
    user_prompt = (
        f"Parent question:\n{question}\n\n"
        f"{extra_block}"
        f"TIS document excerpts:\n{format_evidence(evidence)}\n\n"
        "Write the WhatsApp reply now.\n"
        "Use only facts explicitly stated in the excerpts above. "
        "If the excerpts mention both when campus opens and when school or classes start, "
        "answer with the official start time. "
        "If the excerpts do not clearly answer the question, say you cannot confirm it "
        "from official TIS sources — do not guess or agree with assumptions."
    )
    messages.append({"role": "user", "content": user_prompt})

    try:
        completion = openai.chat.completions.create(
            model=settings.chat_model,
            temperature=0.2,
            messages=messages,
        )
        reply = (completion.choices[0].message.content or "").strip()
        reply = format_whatsapp_reply(reply, has_evidence=True)
    except Exception:
        return AnswerResult(
            reply=(
                "Sorry — I hit a temporary error looking that up. "
                "Please try again in a moment."
            ),
            language=language,
            outcome=OUTCOME_ERROR,
            evidence_count=len(evidence),
            top_similarity=top_sim,
            document_titles=titles,
        )

    outcome = classify_outcome(
        evidence_count=len(evidence),
        top_similarity=top_sim,
        similarity_threshold=config.similarity_threshold,
    )
    if temporal.kind == "date_anchored" and evidence:
        outcome = OUTCOME_SUCCESS

    return AnswerResult(
        reply=reply,
        language=language,
        outcome=outcome,
        evidence_count=len(evidence),
        top_similarity=top_sim,
        document_titles=titles,
    )


def main(argv: list[str] | None = None) -> None:
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        print('Usage: python -m tis_agent.ask "Your question"')
        raise SystemExit(2)
    question = " ".join(args)
    print(answer_question(question).reply)


if __name__ == "__main__":
    main()
