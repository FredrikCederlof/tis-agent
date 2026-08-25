from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from pypdf import PdfReader

from tis_agent.clients import embed_texts, make_openai, make_supabase
from tis_agent.config import Settings
from tis_agent.handbook import chunk_pages, extract_pages
from tis_agent.text_chunk import chunk_plain_text


@dataclass(frozen=True)
class IngestResult:
    document_id: str
    title: str
    chunks: int
    pages: int | None
    storage_path: str
    skipped: bool = False


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parse_modified_time(value: str | None) -> str | None:
    if not value:
        return None
    # Normalize to ISO for Postgres timestamptz.
    return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()


def _chunks_from_bytes(data: bytes, mime_type: str) -> tuple[list, int | None]:
    if mime_type == "application/pdf" or data[:4] == b"%PDF":
        reader = PdfReader(io.BytesIO(data))
        pages = []
        for i, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                from tis_agent.handbook import PageText

                pages.append(PageText(page_number=i, text=text))
        if not pages:
            raise ValueError("No text extracted from PDF.")
        return chunk_pages(pages), len(pages)

    text = data.decode("utf-8", errors="replace")
    chunks = chunk_plain_text(text)
    if not chunks:
        raise ValueError("No text extracted from document.")
    return chunks, None


def _infer_source_type(title: str, mime_type: str) -> str:
    lower = title.lower()
    if "handbook" in lower:
        return "handbook"
    if "calendar" in lower:
        return "calendar"
    if "bus" in lower:
        return "bus"
    if "policy" in lower or "policies" in lower:
        return "policy"
    if mime_type.startswith("application/vnd.google-apps"):
        return "google_doc"
    if mime_type == "application/pdf":
        return "pdf"
    return "document"


def ingest_bytes(
    settings: Settings,
    *,
    data: bytes,
    title: str,
    mime_type: str,
    storage_path: str,
    drive_file_id: str | None = None,
    drive_modified_time: str | None = None,
    language: str = "en",
    source_type: str | None = None,
) -> IngestResult:
    openai = make_openai(settings)
    supabase = make_supabase(settings)
    digest = content_hash(data)
    source_type = source_type or _infer_source_type(title, mime_type)
    modified_iso = _parse_modified_time(drive_modified_time)

    existing_query = supabase.table("documents").select("*")
    if drive_file_id:
        existing_query = existing_query.eq("drive_file_id", drive_file_id)
    else:
        existing_query = existing_query.eq("title", title)
    existing = existing_query.limit(1).execute()
    existing_row = (existing.data or [None])[0]

    if existing_row:
        same_hash = existing_row.get("content_hash") == digest
        same_modified = (
            modified_iso is None
            or existing_row.get("drive_modified_time") == modified_iso
        )
        if same_hash and same_modified:
            return IngestResult(
                document_id=existing_row["id"],
                title=title,
                chunks=0,
                pages=None,
                storage_path=existing_row.get("storage_path") or storage_path,
                skipped=True,
            )
        supabase.table("documents").delete().eq("id", existing_row["id"]).execute()

    chunks, page_count = _chunks_from_bytes(data, mime_type)
    embeddings = embed_texts(
        openai,
        settings.embedding_model,
        [chunk.content for chunk in chunks],
    )

    doc = (
        supabase.table("documents")
        .insert(
            {
                "title": title,
                "source_type": source_type,
                "source_path": Path(storage_path).name,
                "language": language,
                "drive_file_id": drive_file_id,
                "drive_modified_time": modified_iso,
                "storage_path": storage_path,
                "content_hash": digest,
                "mime_type": mime_type,
            }
        )
        .execute()
    )
    document_id = doc.data[0]["id"]

    rows = []
    for chunk, embedding in zip(chunks, embeddings, strict=True):
        rows.append(
            {
                "document_id": document_id,
                "content": chunk.content,
                "section_title": chunk.section_title,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
                "chunk_index": chunk.chunk_index,
                "embedding": embedding,
            }
        )

    for start in range(0, len(rows), 50):
        supabase.table("chunks").insert(rows[start : start + 50]).execute()

    return IngestResult(
        document_id=document_id,
        title=title,
        chunks=len(chunks),
        pages=page_count,
        storage_path=storage_path,
    )


def ingest_path(
    settings: Settings,
    path: Path,
    *,
    title: str | None = None,
    mime_type: str | None = None,
    storage_path: str | None = None,
    drive_file_id: str | None = None,
    drive_modified_time: str | None = None,
) -> IngestResult:
    data = path.read_bytes()
    resolved_title = title or path.stem
    resolved_mime = mime_type or ("application/pdf" if path.suffix.lower() == ".pdf" else "text/plain")
    resolved_storage = storage_path or f"sources/{path.name}"
    return ingest_bytes(
        settings,
        data=data,
        title=resolved_title,
        mime_type=resolved_mime,
        storage_path=resolved_storage,
        drive_file_id=drive_file_id,
        drive_modified_time=drive_modified_time,
    )
