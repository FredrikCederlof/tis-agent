"""Sync the TIS Google Drive folder through the existing ingestion pipeline."""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Protocol

import httpx

from tis_agent.clients import make_supabase
from tis_agent.config import Settings
from tis_agent.drive_auth import drive_access_token
from tis_agent.ingest_document import _parse_modified_time
from tis_agent.sync import SyncFileResult, sync_file_from_path

FOLDER_MIME = "application/vnd.google-apps.folder"
GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
DRIVE_API = "https://www.googleapis.com/drive/v3"

# Types the existing pipeline already ingests. Markdown and CSV are in the
# knowledge folder today, alongside PDFs and Google Docs.
DOWNLOAD_MIMES = {
    "application/pdf": "application/pdf",
    "text/plain": "text/plain",
    "text/markdown": "text/markdown",
    "text/x-markdown": "text/markdown",
    "text/csv": "text/csv",
}
EXTENSION_MIMES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".csv": "text/csv",
}


class DriveSyncError(RuntimeError):
    """Raised when the Drive folder cannot be listed."""


@dataclass(frozen=True)
class DriveItem:
    id: str
    name: str
    mime_type: str
    modified_time: str


@dataclass(frozen=True)
class StoredDriveFile:
    modified_time: str | None
    source_type: str | None


class DriveClient(Protocol):
    def list_children(self, folder_id: str) -> list[DriveItem]:
        """Files and folders directly inside folder_id."""

    def download(self, file_id: str) -> bytes:
        """Download a binary or text file."""

    def export_text(self, file_id: str) -> bytes:
        """Export a Google Doc as UTF-8 plain text."""


@dataclass
class DriveSyncSummary:
    discovered: int = 0
    synced: int = 0
    skipped: int = 0
    failed: int = 0
    revectorized: int = 0
    new_embeddings: int = 0
    new_rows: int = 0
    failures: list[tuple[str, str]] = field(default_factory=list)
    unsupported: list[tuple[str, str]] = field(default_factory=list)

    def render(self) -> str:
        lines = [
            f"Files discovered: {self.discovered}",
            f"Synced: {self.synced}",
            f"Skipped: {self.skipped}",
            f"Failed: {self.failed}",
            f"Re-vectorized: {self.revectorized}",
            f"New embeddings: {self.new_embeddings}",
            f"New Supabase rows: {self.new_rows}",
        ]
        if self.failures:
            lines.append("Failed files:")
            for name, reason in self.failures:
                lines.append(f"- {name}: {reason}")
        if self.unsupported:
            lines.append("Unsupported files:")
            for name, reason in self.unsupported:
                lines.append(f"- {name}: {reason}")
        return "\n".join(lines)


def modified_times_match(stored: str | None, incoming: str | None) -> bool:
    """True when both timestamps are the same second in UTC.

    Stored rows use second precision (for example 2026-08-24T08:35:15+00:00).
    Drive sends fractional seconds. Comparing whole seconds avoids re-embedding
    a file whose content has not changed.
    """
    if not stored or not incoming:
        return False
    try:
        left = _utc_second(stored)
        right = _utc_second(incoming)
    except ValueError:
        return False
    return left == right


def _utc_second(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0)


def ingest_mime_for(item: DriveItem) -> str | None:
    """Return the mime type to ingest, or None when the file should be skipped."""
    if item.mime_type == FOLDER_MIME:
        return None
    if item.mime_type == GOOGLE_DOC_MIME:
        return "text/plain"
    mapped = DOWNLOAD_MIMES.get(item.mime_type)
    if mapped:
        return mapped
    if item.mime_type.startswith("application/vnd.google-apps."):
        return None
    return EXTENSION_MIMES.get(Path(item.name).suffix.lower())


def display_title(name: str) -> str:
    path = Path(name)
    if path.suffix.lower() in EXTENSION_MIMES:
        return path.stem or name
    return name


def walk_files(client: DriveClient, root_folder_id: str) -> list[DriveItem]:
    files: list[DriveItem] = []
    seen_files: set[str] = set()
    seen_folders: set[str] = set()
    stack = [root_folder_id]
    while stack:
        folder_id = stack.pop()
        if folder_id in seen_folders:
            continue
        seen_folders.add(folder_id)
        for item in client.list_children(folder_id):
            if item.mime_type == FOLDER_MIME:
                stack.append(item.id)
                continue
            if item.id in seen_files:
                continue
            seen_files.add(item.id)
            files.append(item)
    files.sort(key=lambda item: (item.name.lower(), item.id))
    return files


def load_drive_index(settings: Settings) -> dict[str, StoredDriveFile]:
    supabase = make_supabase(settings)
    index: dict[str, StoredDriveFile] = {}
    start = 0
    page_size = 1000
    while True:
        response = (
            supabase.table("documents")
            .select("drive_file_id, drive_modified_time, source_type")
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = response.data or []
        for row in rows:
            file_id = row.get("drive_file_id")
            if not file_id:
                continue
            index[str(file_id)] = StoredDriveFile(
                modified_time=row.get("drive_modified_time"),
                source_type=row.get("source_type"),
            )
        if len(rows) < page_size:
            break
        start += page_size
    return index


def _touch_modified_time(settings: Settings, drive_file_id: str, modified_time: str) -> None:
    stored = _parse_modified_time(modified_time)
    if not stored:
        return
    supabase = make_supabase(settings)
    supabase.table("documents").update({"drive_modified_time": stored}).eq(
        "drive_file_id", drive_file_id
    ).execute()


def sync_drive_folder(
    settings: Settings,
    client: DriveClient,
    folder_id: str,
    *,
    load_index: Callable[[Settings], dict[str, StoredDriveFile]] | None = None,
    sync_file: Callable[..., SyncFileResult] | None = None,
    touch_modified: Callable[[Settings, str, str], None] | None = None,
) -> DriveSyncSummary:
    load_index = load_index or load_drive_index
    sync_file = sync_file or sync_file_from_path
    touch_modified = touch_modified or _touch_modified_time
    index = load_index(settings)
    summary = DriveSyncSummary()

    for item in walk_files(client, folder_id):
        summary.discovered += 1
        outcome = _sync_one(
            settings,
            client,
            item,
            index.get(item.id),
            sync_file=sync_file,
            touch_modified=touch_modified,
        )
        print(outcome.line)
        if outcome.status == "synced":
            summary.synced += 1
            summary.new_embeddings += outcome.embeddings
            summary.new_rows += outcome.rows
        elif outcome.status == "revectorized":
            summary.revectorized += 1
            summary.new_embeddings += outcome.embeddings
            summary.new_rows += outcome.rows
        elif outcome.status == "failed":
            summary.failed += 1
            summary.failures.append((item.name, outcome.reason))
        else:
            summary.skipped += 1
            if outcome.unsupported:
                summary.unsupported.append((item.name, outcome.reason))
    return summary


@dataclass
class _Outcome:
    status: str
    name: str
    reason: str = ""
    embeddings: int = 0
    rows: int = 0
    unsupported: bool = False

    @property
    def line(self) -> str:
        if self.reason:
            return f"[{self.status}] {self.name}: {self.reason}"
        return f"[{self.status}] {self.name}"


def _sync_one(
    settings: Settings,
    client: DriveClient,
    item: DriveItem,
    stored: StoredDriveFile | None,
    *,
    sync_file: Callable[..., SyncFileResult],
    touch_modified: Callable[[Settings, str, str], None],
) -> _Outcome:
    mime = ingest_mime_for(item)
    label = item.name or item.id
    if mime is None:
        return _Outcome(
            "skipped",
            label,
            reason=f"unsupported type {item.mime_type or 'unknown'}",
            unsupported=True,
        )

    if stored and modified_times_match(stored.modified_time, item.modified_time):
        return _Outcome("skipped", label)

    try:
        if item.mime_type == GOOGLE_DOC_MIME:
            data = client.export_text(item.id)
            filename = item.name if Path(item.name).suffix else f"{item.name}.txt"
        else:
            data = client.download(item.id)
            filename = item.name
    except Exception as exc:
        return _Outcome("failed", label, reason=_short_error(exc))

    source_type = stored.source_type if stored and stored.source_type else None
    if source_type is None and item.mime_type == GOOGLE_DOC_MIME:
        source_type = "google_doc"

    try:
        with tempfile.TemporaryDirectory(prefix="tis-drive-") as tmp:
            path = Path(tmp) / _safe_filename(filename)
            path.write_bytes(data)
            result = sync_file(
                settings,
                path,
                title=display_title(item.name),
                mime_type=mime,
                drive_file_id=item.id,
                drive_modified_time=item.modified_time,
                source_type=source_type,
            )
    except Exception as exc:
        return _Outcome("failed", label, reason=_short_error(exc))

    if result.status == "skipped":
        if not stored or not modified_times_match(stored.modified_time, item.modified_time):
            try:
                touch_modified(settings, item.id, item.modified_time)
            except Exception as exc:
                return _Outcome("failed", label, reason=_short_error(exc))
        return _Outcome("skipped", label)

    embeddings = result.chunks
    rows = 1 + result.chunks
    if stored:
        return _Outcome("revectorized", label, embeddings=embeddings, rows=rows)
    return _Outcome("synced", label, embeddings=embeddings, rows=rows)


def _safe_filename(name: str) -> str:
    cleaned = name.replace("/", "_").replace("\x00", "").strip() or "file"
    return cleaned[-180:]


def _short_error(exc: Exception) -> str:
    text = " ".join(str(exc).split())
    return text[:300] or exc.__class__.__name__


class GoogleDriveClient:
    def __init__(self, access_token: str, *, client_email: str = "") -> None:
        self._token = access_token
        self.client_email = client_email
        self._http = httpx.Client(timeout=180.0)

    def close(self) -> None:
        self._http.close()

    def list_children(self, folder_id: str) -> list[DriveItem]:
        items: list[DriveItem] = []
        page_token: str | None = None
        while True:
            params = {
                "q": f"'{_escape_query(folder_id)}' in parents and trashed = false",
                "fields": "nextPageToken, files(id, name, mimeType, modifiedTime)",
                "pageSize": 1000,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if page_token:
                params["pageToken"] = page_token
            response = self._request("GET", f"{DRIVE_API}/files", params=params)
            body = response.json()
            for raw in body.get("files") or []:
                items.append(
                    DriveItem(
                        id=str(raw["id"]),
                        name=str(raw.get("name") or raw["id"]),
                        mime_type=str(raw.get("mimeType") or ""),
                        modified_time=str(raw.get("modifiedTime") or ""),
                    )
                )
            page_token = body.get("nextPageToken")
            if not page_token:
                break
        return items

    def download(self, file_id: str) -> bytes:
        response = self._request(
            "GET",
            f"{DRIVE_API}/files/{file_id}",
            params={"alt": "media", "supportsAllDrives": "true"},
        )
        return response.content

    def export_text(self, file_id: str) -> bytes:
        response = self._request(
            "GET",
            f"{DRIVE_API}/files/{file_id}/export",
            params={"mimeType": "text/plain", "supportsAllDrives": "true"},
        )
        return response.content

    def _request(self, method: str, url: str, *, params: dict | None = None) -> httpx.Response:
        try:
            response = self._http.request(
                method,
                url,
                params=params,
                headers={"Authorization": f"Bearer {self._token}"},
            )
        except httpx.HTTPError as exc:
            raise DriveSyncError(f"Drive request failed: {exc}") from exc
        if response.status_code >= 400:
            raise DriveSyncError(_drive_http_error(response, self.client_email))
        return response


def _escape_query(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _drive_http_error(response: httpx.Response, client_email: str) -> str:
    message = response.text[:300]
    try:
        body = response.json()
        api_message = (body.get("error") or {}).get("message")
        if api_message:
            message = str(api_message)
    except Exception:
        pass
    hint = ""
    if response.status_code in {401, 403, 404} and client_email:
        hint = f" Share the knowledge folder with {client_email} as a Viewer."
    return f"HTTP {response.status_code}: {message}.{hint}"


def build_google_drive_client() -> GoogleDriveClient:
    token, email = drive_access_token()
    return GoogleDriveClient(token, client_email=email)


def run_drive_sync(settings: Settings, *, folder_id: str | None = None) -> DriveSyncSummary:
    client = build_google_drive_client()
    try:
        return sync_drive_folder(settings, client, folder_id or settings.drive_folder_id)
    finally:
        client.close()
