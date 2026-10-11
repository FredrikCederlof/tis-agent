"""Extract and ingest Google Drive / Docs links found in school bulletins.

School mail often points parents at a Drive PDF (packing list, letter) instead of
pasting the content. The weekly bulletin keeps those URLs as text; this module
pulls the linked files into the same RAG store so Tina can answer from them.
"""

from __future__ import annotations

import logging
import re
import tempfile
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

from tis_agent.config import Settings
from tis_agent.drive_sync import (
    EXTENSION_MIMES,
    FOLDER_MIME,
    GOOGLE_DOC_MIME,
    DriveClient,
    DriveSyncError,
    build_google_drive_client,
    display_title,
    ingest_mime_for,
)
from tis_agent.sync import SyncFileResult, sync_file_from_path

logger = logging.getLogger("tis_agent.bulletin_links")

# drive.google.com/file/d/<id>/...
# drive.google.com/open?id=<id>
# docs.google.com/document/d/<id>/...
DRIVE_LINK_RE = re.compile(
    r"(?i)https?://(?:www\.)?"
    r"(?:"
    r"drive\.google\.com/(?:file/d/|open\?(?:[^/\s#]*&)?id=)"
    r"|docs\.google\.com/document/d/"
    r")"
    r"([a-zA-Z0-9_-]{10,})"
)


@dataclass(frozen=True)
class DriveLinkRef:
    file_id: str
    url: str


@dataclass
class LinkedDriveSyncResult:
    file_id: str
    title: str | None = None
    status: str = "pending"
    reason: str = ""
    chunks: int = 0
    document_id: str | None = None


@dataclass
class LinkedDriveSyncSummary:
    discovered: int = 0
    synced: int = 0
    skipped: int = 0
    failed: int = 0
    results: list[LinkedDriveSyncResult] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "discovered": self.discovered,
            "synced": self.synced,
            "skipped": self.skipped,
            "failed": self.failed,
            "results": [asdict(row) for row in self.results],
        }


def extract_drive_links(text: str) -> list[DriveLinkRef]:
    """Unique Drive file / Google Doc ids from bulletin markdown, order preserved."""
    seen: set[str] = set()
    out: list[DriveLinkRef] = []
    for match in DRIVE_LINK_RE.finditer(text or ""):
        file_id = match.group(1)
        if file_id in seen:
            continue
        seen.add(file_id)
        out.append(DriveLinkRef(file_id=file_id, url=match.group(0)))
    return out


def sync_linked_drive_files(
    settings: Settings,
    text: str,
    *,
    client: DriveClient | None = None,
    sync_file: Callable[..., SyncFileResult] | None = None,
) -> LinkedDriveSyncSummary:
    """Download Drive/Docs links in *text* and ingest them into Supabase."""
    links = extract_drive_links(text)
    summary = LinkedDriveSyncSummary(discovered=len(links))
    if not links:
        return summary

    owns_client = client is None
    if client is None:
        client = build_google_drive_client()
    sync_file = sync_file or sync_file_from_path

    try:
        for link in links:
            row = _sync_one_link(settings, client, link, sync_file=sync_file)
            summary.results.append(row)
            if row.status == "synced":
                summary.synced += 1
            elif row.status == "skipped":
                summary.skipped += 1
            else:
                summary.failed += 1
            logger.info(
                "bulletin link %s status=%s title=%s reason=%s",
                link.file_id,
                row.status,
                row.title,
                row.reason,
            )
    finally:
        if owns_client:
            close = getattr(client, "close", None)
            if callable(close):
                close()
    return summary


def _sync_one_link(
    settings: Settings,
    client: DriveClient,
    link: DriveLinkRef,
    *,
    sync_file: Callable[..., SyncFileResult],
) -> LinkedDriveSyncResult:
    try:
        meta = client.get_metadata(link.file_id)
    except Exception as exc:
        return LinkedDriveSyncResult(
            file_id=link.file_id,
            status="failed",
            reason=_short(exc),
        )

    if meta.mime_type == FOLDER_MIME:
        return LinkedDriveSyncResult(
            file_id=link.file_id,
            title=meta.name,
            status="skipped",
            reason="folder link",
        )

    mime = ingest_mime_for(meta)
    if mime is None:
        suffix_mime = EXTENSION_MIMES.get(Path(meta.name).suffix.lower())
        if suffix_mime:
            mime = suffix_mime
        else:
            return LinkedDriveSyncResult(
                file_id=link.file_id,
                title=meta.name,
                status="skipped",
                reason=f"unsupported type {meta.mime_type or 'unknown'}",
            )

    try:
        if meta.mime_type == GOOGLE_DOC_MIME:
            data = client.export_text(meta.id)
            filename = meta.name if Path(meta.name).suffix else f"{meta.name}.txt"
            source_type = "google_doc"
        else:
            data = client.download(meta.id)
            filename = meta.name
            source_type = "pdf" if mime == "application/pdf" else None
    except Exception as exc:
        return LinkedDriveSyncResult(
            file_id=link.file_id,
            title=meta.name,
            status="failed",
            reason=_short(exc),
        )

    if not data:
        return LinkedDriveSyncResult(
            file_id=link.file_id,
            title=meta.name,
            status="failed",
            reason="empty download",
        )

    title = display_title(meta.name)
    try:
        with tempfile.TemporaryDirectory(prefix="tis-bulletin-link-") as tmp:
            path = Path(tmp) / _safe_filename(filename)
            path.write_bytes(data)
            result = sync_file(
                settings,
                path,
                title=title,
                mime_type=mime,
                drive_file_id=meta.id,
                drive_modified_time=meta.modified_time or None,
                source_type=source_type,
            )
    except Exception as exc:
        return LinkedDriveSyncResult(
            file_id=link.file_id,
            title=title,
            status="failed",
            reason=_short(exc),
        )

    return LinkedDriveSyncResult(
        file_id=link.file_id,
        title=result.title,
        status=result.status,
        chunks=result.chunks,
        document_id=result.document_id,
    )


def _safe_filename(name: str) -> str:
    cleaned = name.replace("/", "_").replace("\x00", "").strip() or "file"
    return cleaned[-180:]


def _short(exc: Exception) -> str:
    text = " ".join(str(exc).split())
    # Drop unused import warning path — DriveSyncError message is enough.
    if isinstance(exc, DriveSyncError):
        return text[:300]
    return text[:300] or exc.__class__.__name__
