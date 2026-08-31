"""Knowledge Hub: curated Q&A projected into the existing RAG store."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from tis_agent.clients import embed_texts, make_openai, make_supabase
from tis_agent.config import Settings, get_settings
from tis_agent.ingest_document import IngestResult, ingest_bytes

KNOWLEDGE_SOURCE_TYPE = "knowledge"
RELATED_MATCH_COUNT = 5


def knowledge_drive_id(entry_id: str) -> str:
    return f"knowledge:{entry_id}"


def knowledge_markdown(
    *,
    primary_question: str,
    similar_questions: list[str],
    answer: str,
    tags: list[str] | None = None,
    source_note: str | None = None,
) -> str:
    """One document body: primary Q, similar phrasings once, single answer."""
    similar = [q.strip() for q in similar_questions if q and q.strip()]
    tag_list = [t.strip() for t in (tags or []) if t and t.strip()]
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
    if tag_list:
        lines.extend(["", f"Tags: {', '.join(tag_list)}"])
    if source_note and source_note.strip():
        lines.extend(["", f"Source: {source_note.strip()}"])
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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_entry_payload(body: dict[str, Any]) -> dict[str, Any]:
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
    }


def _ingest_entry(settings: Settings, entry_id: str, fields: dict[str, Any]) -> IngestResult:
    markdown = knowledge_markdown(
        primary_question=fields["primary_question"],
        similar_questions=fields["similar_questions"],
        answer=fields["answer"],
        tags=fields["tags"],
        source_note=fields["source_note"],
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
) -> dict[str, Any]:
    fields = normalize_entry_payload(body)
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
        "status": "active",
        "updated_at": now,
        "updated_by": fields["updated_by"],
    }
    if entry_id:
        existing = (
            client.table("knowledge_entries")
            .select("id, origin, origin_interaction_id")
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
        client.table("knowledge_entries").update(row).eq("id", entry_id).execute()
        saved_id = entry_id
    else:
        row["created_at"] = now
        inserted = client.table("knowledge_entries").insert(row).execute()
        saved_id = inserted.data[0]["id"]

    ingest = _ingest_entry(settings, saved_id, fields)
    client.table("knowledge_entries").update(
        {"document_id": ingest.document_id, "updated_at": _now_iso()}
    ).eq("id", saved_id).execute()

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
        "status": "skipped" if ingest.skipped else "synced",
        "entry": saved.data[0] if saved.data else {"id": saved_id},
        "ingest": {
            "document_id": ingest.document_id,
            "chunks": ingest.chunks,
            "skipped": ingest.skipped,
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
    if document_id:
        client.table("documents").delete().eq("id", document_id).execute()
    client.table("knowledge_entries").update(
        {
            "status": "archived",
            "document_id": None,
            "updated_at": _now_iso(),
            "updated_by": updated_by,
        }
    ).eq("id", entry_id).execute()
    return {"status": "archived", "id": entry_id, "document_id": document_id}


def related_knowledge_entries(
    question: str,
    *,
    match_count: int = RELATED_MATCH_COUNT,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    """Embed the draft question and surface similar Knowledge Hub chunks."""
    q = (question or "").strip()
    if not q:
        return []
    settings = settings or get_settings()
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
