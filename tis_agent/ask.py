from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date

from tis_agent.clients import embed_texts, make_openai, make_supabase
from tis_agent.config import Settings, get_settings

SYSTEM_PROMPT = """\
You are Tina, a Tokyo International School (TIS) information assistant for parents.
You answer only from the provided handbook excerpts.

Rules:
- Be helpful, calm, concise, and practical.
- Optimize for WhatsApp: short, scannable, most important facts first.
- Do not invent school policies, dates, times, or procedures.
- If the excerpts are not enough, say you could not confirm it from the Community Handbook.
- Prefer Confirmed facts stated in the excerpts. If you must lightly interpret, mark it as Inferred.
- When useful, end with a single Source line naming the handbook and page(s).
- Do not use markdown headings or tables. Plain text and short numbered lists are fine.
- Do not use markdown bold (**text**) or italics.
- Today's date is {today}.
"""


@dataclass(frozen=True)
class Evidence:
    content: str
    section_title: str | None
    page_start: int | None
    page_end: int | None
    document_title: str
    similarity: float


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
) -> str:
    settings = settings or get_settings()
    evidence = retrieve(settings, question)
    openai = make_openai(settings)

    if not evidence:
        return (
            "I couldn’t find anything in the Community Handbook that answers that.\n\n"
            "Source: none found."
        )

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(today=date.today().isoformat()),
        }
    ]
    if history:
        messages.extend(history[-6:])

    user_prompt = (
        f"Parent question:\n{question}\n\n"
        f"Handbook excerpts:\n{format_evidence(evidence)}\n\n"
        "Write the WhatsApp reply now."
    )
    messages.append({"role": "user", "content": user_prompt})

    completion = openai.chat.completions.create(
        model=settings.chat_model,
        temperature=0.2,
        messages=messages,
    )
    reply = (completion.choices[0].message.content or "").strip()
    return reply


def main(argv: list[str] | None = None) -> None:
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        print('Usage: python -m tis_agent.ask "Your question"')
        raise SystemExit(2)
    question = " ".join(args)
    print(answer_question(question))


if __name__ == "__main__":
    main()
