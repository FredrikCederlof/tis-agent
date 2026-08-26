from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date

from tis_agent.agent_config import load_agent_config, match_fixed_answer
from tis_agent.analytics import (
    OUTCOME_ERROR,
    OUTCOME_FIXED_ANSWER,
    OUTCOME_NO_EVIDENCE,
    classify_outcome,
)
from tis_agent.clients import embed_texts, make_openai, make_supabase
from tis_agent.config import Settings, get_settings


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
        return (
            "Jag kunde inte hitta ett officiellt TIS-dokument som svarar på det.\n\n"
            "Källa: ingen träff."
        )
    return (
        "I couldn't find an official TIS source that answers that.\n\n"
        "Source: none found."
    )


@dataclass(frozen=True)
class Evidence:
    content: str
    section_title: str | None
    page_start: int | None
    page_end: int | None
    document_title: str
    similarity: float


@dataclass(frozen=True)
class AnswerResult:
    reply: str
    language: str
    outcome: str
    evidence_count: int
    top_similarity: float | None
    document_titles: list[str] = field(default_factory=list)


def retrieve(settings: Settings, question: str, *, match_count: int = 8) -> list[Evidence]:
    openai = make_openai(settings)
    supabase = make_supabase(settings)
    query_embedding = embed_texts(openai, settings.embedding_model, [question])[0]
    response = supabase.rpc(
        "match_chunks",
        {
            "query_embedding": query_embedding,
            "match_count": match_count,
        },
    ).execute()

    evidence: list[Evidence] = []
    for row in response.data or []:
        evidence.append(
            Evidence(
                content=row["content"],
                section_title=row.get("section_title"),
                page_start=row.get("page_start"),
                page_end=row.get("page_end"),
                document_title=row.get("document_title") or settings.handbook_title,
                similarity=float(row.get("similarity") or 0),
            )
        )
    return evidence


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
        if item.section_title:
            header += f" — {item.section_title}"
        if pages:
            header += f" ({pages})"
        header += f" | similarity={item.similarity:.3f}"
        blocks.append(f"{header}\n{item.content}")
    return "\n\n".join(blocks)


def answer_question(
    question: str,
    *,
    settings: Settings | None = None,
    history: list[dict[str, str]] | None = None,
) -> AnswerResult:
    settings = settings or get_settings()
    language = _reply_language(question)
    config = load_agent_config(settings)

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
        evidence = retrieve(settings, question)
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

    titles = list(dict.fromkeys(e.document_title for e in evidence))
    top_sim = max((e.similarity for e in evidence), default=None)

    if not evidence:
        return AnswerResult(
            reply=no_evidence_reply(question),
            language=language,
            outcome=OUTCOME_NO_EVIDENCE,
            evidence_count=0,
            top_similarity=None,
        )

    openai = make_openai(settings)
    messages = [
        {
            "role": "system",
            "content": config.system_prompt.format(today=date.today().isoformat()),
        }
    ]
    if history:
        messages.extend(history[-6:])

    user_prompt = (
        f"Parent question:\n{question}\n\n"
        f"TIS document excerpts:\n{format_evidence(evidence)}\n\n"
        "Write the WhatsApp reply now."
    )
    messages.append({"role": "user", "content": user_prompt})

    try:
        completion = openai.chat.completions.create(
            model=settings.chat_model,
            temperature=0.2,
            messages=messages,
        )
        reply = (completion.choices[0].message.content or "").strip()
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
    )

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
