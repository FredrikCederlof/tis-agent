"""Knowledge Hub: curated Q&A projected into the existing RAG store."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from tis_agent.clients import embed_texts, make_openai, make_supabase
from tis_agent.config import Settings, get_settings
from tis_agent.ingest_document import IngestResult, ingest_bytes
from tis_agent.temporal import tokyo_today

KNOWLEDGE_SOURCE_TYPE = "knowledge"
RELATED_MATCH_COUNT = 5

KNOWLEDGE_STATUSES = frozenset({"draft", "active", "expired", "archived"})
CONTENT_OWNERS = (
    "TIS Office",
    "Admissions",
    "IT",
    "PYP",
    "MYP",
    "DP",
    "Other",
)
AUDIENCE_OPTIONS = (
    "All",
    "Parents",
    "Students",
    "Teachers",
    "PYP",
    "MYP",
    "DP",
    "Kindergarten",
    *(f"Grade {n}" for n in range(1, 13)),
)
_AUDIENCE_SET = frozenset(AUDIENCE_OPTIONS)


def knowledge_drive_id(entry_id: str) -> str:
    return f"knowledge:{entry_id}"


def _parse_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value).strip()
    if not text:
        return None
    return date.fromisoformat(text[:10])


def effective_status(row: dict[str, Any], *, today: date | None = None) -> str:
    """Resolve display/retrieval status, including auto-expiry from valid_until."""
    today = today or tokyo_today()
    status = str(row.get("status") or "active").strip().lower()
    if status not in KNOWLEDGE_STATUSES:
        status = "active"
    if status in {"archived", "draft"}:
        return status
    valid_until = _parse_date(row.get("valid_until"))
    if valid_until is not None and valid_until < today:
        return "expired"
    if status == "expired":
        return "expired"
    return "active"


def is_retrieval_eligible(row: dict[str, Any], *, today: date | None = None) -> bool:
    return effective_status(row, today=today) == "active"


def is_review_overdue(row: dict[str, Any], *, today: date | None = None) -> bool:
    today = today or tokyo_today()
    review_due = _parse_date(row.get("review_due_date"))
    if review_due is None:
        return False
    return review_due < today and effective_status(row, today=today) != "archived"


def knowledge_markdown(
    *,
    primary_question: str,
    similar_questions: list[str],
    answer: str,
    tags: list[str] | None = None,
    audience: list[str] | None = None,
    exclusion_notes: str | None = None,
) -> str:
    """One document body: primary Q, similar phrasings once, answer + AI guidance.

    Admin-only fields (owner, source URL, review/valid dates, status) stay out of
    this body so edits to them do not force re-embedding.
    """
    similar = [q.strip() for q in similar_questions if q and q.strip()]
    tag_list = [t.strip() for t in (tags or []) if t and t.strip()]
    audience_list = [a.strip() for a in (audience or []) if a and a.strip()]
    lines = [
        f"# {primary_question.strip()}",
        "",
    ]
    if similar:
        lines.append("## Similar questions")
        for q in similar:
            lines.append(f"- {q}")
        lines.append("")
    lines.extend(["## Answer", "", answer.strip()])
    if audience_list:
        lines.extend(["", f"Applies to: {', '.join(audience_list)}"])
    if exclusion_notes and exclusion_notes.strip():
        lines.extend(
            [
                "",
                "## Do not use this article when / Common misconceptions",
                "",
                exclusion_notes.strip(),
            ]
        )
    if tag_list:
        lines.extend(["", f"Tags: {', '.join(tag_list)}"])
    return "\n".join(lines).strip() + "\n"


def chunk_knowledge_markdown(text: str) -> list[str]:
    """One evidence chunk per entry — never N documents with the same answer."""
    body = (text or "").strip()
    return [body] if body else []


def clean_string_list(values: Any) -> list[str]:
    if not values:
        return []
    if isinstance(values, str):
        values = [part.strip() for part in values.replace(",", "\n").split("\n") if part.strip()]
    return [str(v).strip() for v in values if str(v).strip()]


def clean_audience(values: Any) -> list[str]:
    cleaned = clean_string_list(values)
    allowed = [item for item in cleaned if item in _AUDIENCE_SET]
    if not allowed:
        return ["All"]
    # All alone is enough; keep All if mixed with specifics for simplicity drop All when others present
    if "All" in allowed and len(allowed) > 1:
        allowed = [item for item in allowed if item != "All"]
    # Preserve vocabulary order
    order = {name: index for index, name in enumerate(AUDIENCE_OPTIONS)}
    return sorted(set(allowed), key=lambda item: order.get(item, 999))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_entry_payload(body: dict[str, Any], *, today: date | None = None) -> dict[str, Any]:
    today = today or tokyo_today()
    primary = str(body.get("primary_question") or "").strip()
    answer = str(body.get("answer") or "").strip()
    if not primary:
        raise ValueError("primary_question is required")
    if not answer:
        raise ValueError("answer is required")
    origin = str(body.get("origin") or "manual").strip().lower()
    if origin not in {"manual", "inbox"}:
        raise ValueError("origin must be manual or inbox")
    origin_interaction_id = body.get("origin_interaction_id") or None
    if origin_interaction_id:
        origin_interaction_id = str(origin_interaction_id)
        UUID(origin_interaction_id)
    elif origin == "inbox":
        raise ValueError("origin_interaction_id is required when origin is inbox")

    status = str(body.get("status") or "active").strip().lower()
    if status not in KNOWLEDGE_STATUSES:
        raise ValueError("status must be draft, active, expired, or archived")

    valid_until = _parse_date(body.get("valid_until"))
    review_due_date = _parse_date(body.get("review_due_date"))
    content_owner = (str(body.get("content_owner") or "").strip() or None)
    source_url = (str(body.get("source_url") or "").strip() or None)
    exclusion_notes = (str(body.get("exclusion_notes") or "").strip() or None)
    audience = clean_audience(body.get("audience"))

    resolved = effective_status(
        {"status": status, "valid_until": valid_until},
        today=today,
    )

    return {
        "primary_question": primary,
        "similar_questions": clean_string_list(body.get("similar_questions")),
        "answer": answer,
        "category": (str(body.get("category") or "").strip() or None),
        "tags": clean_string_list(body.get("tags")),
        "source_note": (str(body.get("source_note") or "").strip() or None),
        "origin": origin,
        "origin_interaction_id": origin_interaction_id,
        "updated_by": (str(body.get("updated_by") or "").strip() or None),
        "status": resolved,
        "valid_until": valid_until.isoformat() if valid_until else None,
        "review_due_date": review_due_date.isoformat() if review_due_date else None,
        "content_owner": content_owner,
        "source_url": source_url,
        "audience": audience,
        "exclusion_notes": exclusion_notes,
    }


def _ingest_entry(settings: Settings, entry_id: str, fields: dict[str, Any]) -> IngestResult:
    markdown = knowledge_markdown(
        primary_question=fields["primary_question"],
        similar_questions=fields["similar_questions"],
        answer=fields["answer"],
        tags=fields["tags"],
        audience=fields.get("audience"),
        exclusion_notes=fields.get("exclusion_notes"),
    )
    return ingest_bytes(
        settings,
        data=markdown.encode("utf-8"),
        title=fields["primary_question"][:200],
        mime_type="text/markdown",
        storage_path=f"knowledge/{entry_id}.md",
        drive_file_id=knowledge_drive_id(entry_id),
        drive_modified_time=_now_iso(),
        source_type=KNOWLEDGE_SOURCE_TYPE,
    )


def _clear_document(client: Any, document_id: str | None) -> None:
    if document_id:
        client.table("documents").delete().eq("id", document_id).execute()


def _mark_inbox_reviewed(
    client: Any,
    interaction_id: str,
    entry_id: str,
    reviewed_by: str | None,
) -> None:
    client.table("interactions").update(
        {
            "knowledge_entry_id": entry_id,
            "reviewed_at": _now_iso(),
            "reviewed_by": reviewed_by or "knowledge-hub",
        }
    ).eq("id", interaction_id).execute()


def save_knowledge_entry(
    body: dict[str, Any],
    *,
    entry_id: str | None = None,
    settings: Settings | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    today = today or tokyo_today()
    fields = normalize_entry_payload(body, today=today)
    settings = settings or get_settings()
    client = make_supabase(settings)
    now = _now_iso()
    row = {
        "primary_question": fields["primary_question"],
        "similar_questions": fields["similar_questions"],
        "answer": fields["answer"],
        "category": fields["category"],
        "tags": fields["tags"],
        "source_note": fields["source_note"],
        "origin": fields["origin"],
        "origin_interaction_id": fields["origin_interaction_id"],
        "status": fields["status"],
        "valid_until": fields["valid_until"],
        "review_due_date": fields["review_due_date"],
        "content_owner": fields["content_owner"],
        "source_url": fields["source_url"],
        "audience": fields["audience"],
        "exclusion_notes": fields["exclusion_notes"],
        "updated_at": now,
        "updated_by": fields["updated_by"],
    }
    existing_document_id: str | None = None
    if entry_id:
        existing = (
            client.table("knowledge_entries")
            .select("id, origin, origin_interaction_id, document_id")
            .eq("id", entry_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            raise KeyError(f"knowledge entry not found: {entry_id}")
        row["origin"] = existing.data[0].get("origin") or fields["origin"]
        row["origin_interaction_id"] = existing.data[0].get("origin_interaction_id") or fields[
            "origin_interaction_id"
        ]
        existing_document_id = existing.data[0].get("document_id")
        client.table("knowledge_entries").update(row).eq("id", entry_id).execute()
        saved_id = entry_id
    else:
        row["created_at"] = now
        inserted = client.table("knowledge_entries").insert(row).execute()
        saved_id = inserted.data[0]["id"]

    eligible = is_retrieval_eligible(fields, today=today)
    ingest: IngestResult | None = None
    if eligible:
        ingest = _ingest_entry(settings, saved_id, fields)
        update_fields: dict[str, Any] = {
            "document_id": ingest.document_id,
            "updated_at": _now_iso(),
        }
        if not ingest.skipped:
            update_fields["last_ingested_at"] = _now_iso()
        client.table("knowledge_entries").update(update_fields).eq("id", saved_id).execute()
    else:
        _clear_document(client, existing_document_id)
        client.table("knowledge_entries").update(
            {
                "document_id": None,
                "updated_at": _now_iso(),
            }
        ).eq("id", saved_id).execute()
        ingest = IngestResult(
            document_id="",
            title=fields["primary_question"][:200],
            chunks=0,
            pages=None,
            storage_path=f"knowledge/{saved_id}.md",
            skipped=True,
        )

    origin_interaction_id = row.get("origin_interaction_id")
    if not entry_id and origin_interaction_id:
        _mark_inbox_reviewed(client, str(origin_interaction_id), saved_id, fields["updated_by"])

    saved = (
        client.table("knowledge_entries")
        .select("*")
        .eq("id", saved_id)
        .limit(1)
        .execute()
    )
    return {
        "status": "skipped" if (not eligible or ingest.skipped) else "synced",
        "entry": saved.data[0] if saved.data else {"id": saved_id},
        "ingest": {
            "document_id": ingest.document_id or None,
            "chunks": ingest.chunks,
            "skipped": ingest.skipped or not eligible,
            "eligible": eligible,
        },
    }


def archive_knowledge_entry(
    entry_id: str,
    *,
    updated_by: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    client = make_supabase(settings)
    existing = (
        client.table("knowledge_entries")
        .select("id, document_id, status")
        .eq("id", entry_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise KeyError(f"knowledge entry not found: {entry_id}")
    document_id = existing.data[0].get("document_id")
    _clear_document(client, document_id)
    client.table("knowledge_entries").update(
        {
            "status": "archived",
            "document_id": None,
            "updated_at": _now_iso(),
            "updated_by": updated_by,
        }
    ).eq("id", entry_id).execute()
    return {"status": "archived", "id": entry_id, "document_id": document_id}


def delete_knowledge_entry(
    entry_id: str,
    *,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Remove a Hub row and its RAG document. Tina will no longer retrieve it."""
    settings = settings or get_settings()
    client = make_supabase(settings)
    existing = (
        client.table("knowledge_entries")
        .select("id, document_id")
        .eq("id", entry_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise KeyError(f"knowledge entry not found: {entry_id}")
    document_id = existing.data[0].get("document_id")
    _clear_document(client, document_id)
    client.table("knowledge_entries").delete().eq("id", entry_id).execute()
    return {"status": "deleted", "id": entry_id, "document_id": document_id}


def eligible_knowledge_document_ids(
    *,
    settings: Settings | None = None,
    document_ids: set[str] | None = None,
    today: date | None = None,
    client: Any | None = None,
) -> set[str]:
    """Document IDs for Active knowledge entries that Tina may use."""
    today = today or tokyo_today()
    settings = settings or get_settings()
    supabase = client or make_supabase(settings)
    response = (
        supabase.table("knowledge_entries")
        .select("document_id, status, valid_until")
        .execute()
    )
    eligible: set[str] = set()
    for row in response.data or []:
        doc_id = row.get("document_id")
        if not doc_id:
            continue
        if document_ids is not None and str(doc_id) not in document_ids:
            continue
        if is_retrieval_eligible(row, today=today):
            eligible.add(str(doc_id))
    return eligible


def filter_eligible_knowledge_evidence(
    evidence: list[Any],
    *,
    settings: Settings | None = None,
    today: date | None = None,
    client: Any | None = None,
) -> list[Any]:
    """Drop knowledge chunks that are draft/expired/archived or past valid_until."""
    knowledge_ids = {
        str(item.document_id)
        for item in evidence
        if getattr(item, "source_type", None) == KNOWLEDGE_SOURCE_TYPE
        and getattr(item, "document_id", None)
    }
    if not knowledge_ids:
        return evidence
    eligible = eligible_knowledge_document_ids(
        settings=settings,
        document_ids=knowledge_ids,
        today=today,
        client=client,
    )
    return [
        item
        for item in evidence
        if getattr(item, "source_type", None) != KNOWLEDGE_SOURCE_TYPE
        or (
            getattr(item, "document_id", None)
            and str(item.document_id) in eligible
        )
    ]


def related_knowledge_entries(
    question: str,
    *,
    match_count: int = RELATED_MATCH_COUNT,
    settings: Settings | None = None,
    today: date | None = None,
) -> list[dict[str, Any]]:
    """Embed the draft question and surface similar Knowledge Hub chunks."""
    q = (question or "").strip()
    if not q:
        return []
    settings = settings or get_settings()
    today = today or tokyo_today()
    vector = embed_texts(make_openai(settings), settings.embedding_model, [q])[0]
    client = make_supabase(settings)
    params = {
        "query_embedding": vector,
        "match_count": match_count,
        "filter_source_type": KNOWLEDGE_SOURCE_TYPE,
    }
    try:
        rows = client.rpc("match_chunks", params).execute().data or []
    except Exception:
        params.pop("filter_source_type")
        rows = client.rpc("match_chunks", params).execute().data or []
    eligible = eligible_knowledge_document_ids(
        settings=settings,
        document_ids={
            str(row.get("document_id"))
            for row in rows
            if row.get("document_id")
        }
        or None,
        today=today,
        client=client,
    )
    return [
        {
            "chunk_id": row.get("id"),
            "document_id": row.get("document_id"),
            "title": row.get("document_title") or row.get("title"),
            "similarity": row.get("similarity"),
            "content": (row.get("content") or "")[:400],
        }
        for row in rows
        if (row.get("source_type") or KNOWLEDGE_SOURCE_TYPE) == KNOWLEDGE_SOURCE_TYPE
        and row.get("document_id")
        and str(row.get("document_id")) in eligible
    ]


def parse_json_body(raw: bytes | str | None) -> dict[str, Any]:
    if not raw:
        return {}
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("JSON object required")
    return data
