"""Drive sync skips unchanged files before download, and is idempotent."""

from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone

from tis_agent.config import Settings
from tis_agent.drive_auth import DriveAuthError, parse_service_account_json
from tis_agent.drive_sync import (
    DriveItem,
    DriveSyncSummary,
    StoredDriveFile,
    ingest_mime_for,
    modified_times_match,
    sync_drive_folder,
    walk_files,
)
from tis_agent.ingest_document import _parse_modified_time
from tis_agent.sync import SyncFileResult

ROOT = "root-folder"
NESTED = "nested-folder"
UNCHANGED = "file-unchanged"
CHANGED = "file-changed"
NEW = "file-new"
DOC = "file-doc"
PDF_TIME = "2026-08-24T08:35:15.000Z"
STORED_PDF_TIME = "2026-08-24T08:35:15+00:00"


class FakeDrive:
    def __init__(self, folders: dict[str, list[DriveItem]], blobs: dict[str, bytes] | None = None):
        self.folders = folders
        self.blobs = blobs or {}
        self.downloads: list[str] = []
        self.exports: list[str] = []

    def list_children(self, folder_id: str) -> list[DriveItem]:
        return list(self.folders.get(folder_id, []))

    def download(self, file_id: str) -> bytes:
        self.downloads.append(file_id)
        if file_id not in self.blobs:
            raise RuntimeError(f"missing {file_id}")
        return self.blobs[file_id]

    def export_text(self, file_id: str) -> bytes:
        self.exports.append(file_id)
        if file_id not in self.blobs:
            raise RuntimeError(f"missing {file_id}")
        return self.blobs[file_id]


def _settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_secret_key="test-secret",
        openai_api_key="sk-test",
    )


def _item(file_id: str, name: str, mime: str, modified: str) -> DriveItem:
    return DriveItem(id=file_id, name=name, mime_type=mime, modified_time=modified)


def _synced(file_id: str, chunks: int = 2) -> SyncFileResult:
    return SyncFileResult(
        title=file_id,
        drive_file_id=file_id,
        storage_path=f"sources/{file_id}/file",
        status="synced",
        chunks=chunks,
    )


def test_modified_times_match_drive_and_supabase_formats() -> None:
    assert modified_times_match(STORED_PDF_TIME, PDF_TIME)
    assert modified_times_match(PDF_TIME, "2026-08-24T08:35:15.123456+00:00")
    assert not modified_times_match(STORED_PDF_TIME, "2026-08-24T08:35:16.000Z")
    assert not modified_times_match(None, PDF_TIME)
    assert not modified_times_match("", PDF_TIME)


def test_supported_types_and_unsupported() -> None:
    assert ingest_mime_for(_item("a", "Handbook.pdf", "application/pdf", PDF_TIME)) == "application/pdf"
    assert (
        ingest_mime_for(_item("b", "Notes", "application/vnd.google-apps.document", PDF_TIME))
        == "text/plain"
    )
    assert ingest_mime_for(_item("c", "Dates.csv", "text/csv", PDF_TIME)) == "text/csv"
    assert ingest_mime_for(_item("d", "Guide.md", "text/markdown", PDF_TIME)) == "text/markdown"
    assert ingest_mime_for(_item("e", "Notes.md", "application/octet-stream", PDF_TIME)) == "text/markdown"
    assert ingest_mime_for(_item("f", "Photo.png", "image/png", PDF_TIME)) is None
    assert ingest_mime_for(_item("g", "Sheet", "application/vnd.google-apps.spreadsheet", PDF_TIME)) is None


def test_walks_nested_folders_once() -> None:
    shared = _item("shared", "Shared.pdf", "application/pdf", PDF_TIME)
    client = FakeDrive(
        {
            ROOT: [
                _item(NESTED, "Curriculum Guides", "application/vnd.google-apps.folder", PDF_TIME),
                shared,
            ],
            NESTED: [shared, _item("inner", "Inner.pdf", "application/pdf", PDF_TIME)],
        }
    )
    found = walk_files(client, ROOT)
    assert [item.id for item in found] == ["inner", "shared"]


def test_unchanged_file_is_not_downloaded_or_ingested() -> None:
    client = FakeDrive(
        {ROOT: [_item(UNCHANGED, "Handbook.pdf", "application/pdf", PDF_TIME)]},
        blobs={UNCHANGED: b"%PDF-should-not-be-read"},
    )
    calls: list[str] = []

    def sync_file(*_args, **_kwargs):
        calls.append("called")
        raise AssertionError("ingest should not run")

    summary = sync_drive_folder(
        _settings(),
        client,
        ROOT,
        load_index=lambda _settings: {
            UNCHANGED: StoredDriveFile(modified_time=STORED_PDF_TIME, source_type="handbook")
        },
        sync_file=sync_file,
        touch_modified=lambda *_args: None,
    )
    assert client.downloads == []
    assert client.exports == []
    assert calls == []
    assert summary.discovered == 1
    assert summary.skipped == 1
    assert summary.synced == 0
    assert summary.revectorized == 0
    assert summary.new_embeddings == 0
    assert summary.new_rows == 0
    assert summary.failed == 0


def test_new_and_changed_files_use_existing_ingest_once() -> None:
    client = FakeDrive(
        {
            ROOT: [
                _item(NEW, "New Policy.pdf", "application/pdf", PDF_TIME),
                _item(CHANGED, "Bus.pdf", "application/pdf", "2026-09-01T00:00:00.000Z"),
                _item(DOC, "Absence notes", "application/vnd.google-apps.document", PDF_TIME),
                _item("pic", "logo.png", "image/png", PDF_TIME),
            ]
        },
        blobs={
            NEW: b"%PDF-new",
            CHANGED: b"%PDF-changed",
            DOC: b"Absence must be reported by 8am.",
        },
    )
    seen: list[tuple[str, str | None]] = []

    def sync_file(_settings, path, **kwargs):
        seen.append((kwargs["drive_file_id"], kwargs.get("source_type")))
        assert path.read_bytes()
        chunks = 4 if kwargs["drive_file_id"] == CHANGED else 2
        return _synced(kwargs["drive_file_id"], chunks=chunks)

    summary = sync_drive_folder(
        _settings(),
        client,
        ROOT,
        load_index=lambda _settings: {
            CHANGED: StoredDriveFile(modified_time=STORED_PDF_TIME, source_type="bus")
        },
        sync_file=sync_file,
        touch_modified=lambda *_args: (_ for _ in ()).throw(AssertionError("unexpected touch")),
    )
    assert client.downloads == [CHANGED, NEW]
    assert client.exports == [DOC]
    assert seen == [(DOC, "google_doc"), (CHANGED, "bus"), (NEW, None)]
    assert summary.synced == 2
    assert summary.revectorized == 1
    assert summary.skipped == 1
    assert summary.failed == 0
    assert summary.new_embeddings == 2 + 2 + 4
    assert summary.new_rows == (1 + 2) + (1 + 2) + (1 + 4)
    assert summary.unsupported == [("logo.png", "unsupported type image/png")]
    rendered = summary.render()
    for label in (
        "Files discovered: 4",
        "Synced: 2",
        "Skipped: 1",
        "Failed: 0",
        "Re-vectorized: 1",
        "New embeddings: 8",
        "New Supabase rows: 11",
        "logo.png: unsupported type image/png",
    ):
        assert label in rendered


def test_second_run_creates_no_embeddings_or_rows() -> None:
    drive_time = PDF_TIME
    index: dict[str, StoredDriveFile] = {}
    client = FakeDrive(
        {
            ROOT: [
                _item(NESTED, "Curriculum Guides", "application/vnd.google-apps.folder", drive_time),
                _item(NEW, "Handbook.pdf", "application/pdf", drive_time),
            ],
            NESTED: [_item(DOC, "Calendar notes", "application/vnd.google-apps.document", drive_time)],
        },
        blobs={NEW: b"%PDF-1", DOC: b"School starts Monday."},
    )
    ingest_calls: list[str] = []

    def load_index(_settings):
        return dict(index)

    def sync_file(_settings, _path, **kwargs):
        ingest_calls.append(kwargs["drive_file_id"])
        index[kwargs["drive_file_id"]] = StoredDriveFile(
            modified_time=_parse_modified_time(kwargs["drive_modified_time"]),
            source_type=kwargs.get("source_type") or "document",
        )
        return _synced(kwargs["drive_file_id"], chunks=3)

    first = sync_drive_folder(
        _settings(),
        client,
        ROOT,
        load_index=load_index,
        sync_file=sync_file,
        touch_modified=lambda *_args: None,
    )
    assert first.synced == 2
    assert first.new_embeddings == 6
    assert first.new_rows == 8
    assert index[NEW].modified_time == STORED_PDF_TIME

    client.downloads.clear()
    client.exports.clear()
    ingest_calls.clear()
    second = sync_drive_folder(
        _settings(),
        client,
        ROOT,
        load_index=load_index,
        sync_file=sync_file,
        touch_modified=lambda *_args: (_ for _ in ()).throw(AssertionError("unexpected touch")),
    )
    assert ingest_calls == []
    assert client.downloads == []
    assert client.exports == []
    assert second.discovered == 2
    assert second.synced == 0
    assert second.revectorized == 0
    assert second.skipped == 2
    assert second.failed == 0
    assert second.new_embeddings == 0
    assert second.new_rows == 0


def test_download_failure_does_not_ingest() -> None:
    client = FakeDrive({ROOT: [_item(NEW, "Broken.pdf", "application/pdf", PDF_TIME)]})
    calls: list[str] = []

    summary = sync_drive_folder(
        _settings(),
        client,
        ROOT,
        load_index=lambda _settings: {},
        sync_file=lambda *_args, **_kwargs: calls.append("x") or _synced(NEW),
        touch_modified=lambda *_args: None,
    )
    assert calls == []
    assert summary.failed == 1
    assert summary.synced == 0
    assert summary.new_embeddings == 0
    assert summary.new_rows == 0
    assert "Broken.pdf" in summary.render()
    assert "missing file-new" in summary.render()


def test_same_bytes_updates_modified_time_without_new_rows() -> None:
    touches: list[tuple[str, str]] = []
    client = FakeDrive(
        {ROOT: [_item(CHANGED, "Bus.pdf", "application/pdf", "2026-09-02T01:02:03.000Z")]},
        blobs={CHANGED: b"%PDF-same"},
    )

    def sync_file(*_args, **kwargs):
        return SyncFileResult(
            title="Bus",
            drive_file_id=kwargs["drive_file_id"],
            storage_path="sources/x",
            status="skipped",
            chunks=0,
        )

    summary = sync_drive_folder(
        _settings(),
        client,
        ROOT,
        load_index=lambda _settings: {
            CHANGED: StoredDriveFile(modified_time=STORED_PDF_TIME, source_type="bus")
        },
        sync_file=sync_file,
        touch_modified=lambda _settings, file_id, modified: touches.append((file_id, modified)),
    )
    assert client.downloads == [CHANGED]
    assert summary.synced == 0
    assert summary.revectorized == 0
    assert summary.new_embeddings == 0
    assert summary.new_rows == 0
    assert summary.skipped == 1
    assert touches == [(CHANGED, "2026-09-02T01:02:03.000Z")]


def test_service_account_json_parsing(monkeypatch=None) -> None:
    info = {
        "type": "service_account",
        "client_email": "sync@example.iam.gserviceaccount.com",
        "private_key": "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    }
    raw = json.dumps(info)
    assert parse_service_account_json(raw)["client_email"] == info["client_email"]
    encoded = base64.b64encode(raw.encode()).decode()
    assert parse_service_account_json(encoded)["private_key"] == info["private_key"]
    try:
        parse_service_account_json("{")
        raise AssertionError("invalid json should fail")
    except DriveAuthError:
        pass
    try:
        parse_service_account_json(json.dumps({"client_email": "a@b.c"}))
        raise AssertionError("missing key should fail")
    except DriveAuthError:
        pass


def test_missing_credentials_exit() -> None:
    saved_json = os.environ.pop("GOOGLE_SERVICE_ACCOUNT_JSON", None)
    saved_path = os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
    try:
        from tis_agent.sync import main

        try:
            main(["drive"])
        except SystemExit as exc:
            assert exc.code == 1
        else:
            raise AssertionError("sync drive should exit when credentials are missing")
    finally:
        if saved_json is not None:
            os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"] = saved_json
        if saved_path is not None:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = saved_path


def test_summary_zero_line() -> None:
    text = DriveSyncSummary(discovered=3, skipped=3).render()
    assert "Synced: 0" in text
    assert "Re-vectorized: 0" in text
    assert "New embeddings: 0" in text
    assert "New Supabase rows: 0" in text


def verify_live_database_idempotency() -> None:
    """Run the skip path twice against the real documents table.

    The Drive listing is the files already stored, with Drive-style timestamps.
    Download and ingest raise if called, so a bad comparison cannot rewrite rows.
    """
    from tis_agent.clients import make_supabase
    from tis_agent.config import get_settings

    settings = get_settings()
    supabase = make_supabase(settings)
    before = _db_snapshot(supabase)
    drive_files = []
    for row in before["doc_rows"]:
        file_id = row.get("drive_file_id") or ""
        modified = row.get("drive_modified_time")
        if not file_id or file_id.startswith("url:") or not modified:
            continue
        drive_files.append(
            _item(file_id, row.get("title") or file_id, "application/pdf", _as_drive_time(modified))
        )
    if not drive_files:
        raise SystemExit("No stored Drive files to verify.")

    client = FakeDrive({settings.drive_folder_id: drive_files})

    def refuse_ingest(*_args, **_kwargs):
        raise AssertionError("unchanged Drive file was ingested")

    def refuse_touch(*_args, **_kwargs):
        raise AssertionError("unchanged Drive file was updated")

    for _ in range(2):
        summary = sync_drive_folder(
            settings,
            client,
            settings.drive_folder_id,
            sync_file=refuse_ingest,
            touch_modified=refuse_touch,
        )
        assert summary.discovered == len(drive_files)
        assert summary.skipped == len(drive_files)
        assert summary.synced == 0
        assert summary.revectorized == 0
        assert summary.failed == 0
        assert summary.new_embeddings == 0
        assert summary.new_rows == 0
        assert client.downloads == []
        assert client.exports == []

    after = _db_snapshot(supabase)
    if before != after:
        raise SystemExit(
            "Database changed during unchanged Drive sync: "
            f"docs {len(before['doc_rows'])}->{len(after['doc_rows'])}, "
            f"chunks {len(before['chunk_rows'])}->{len(after['chunk_rows'])}"
        )
    print(
        f"Live idempotency ok: {len(drive_files)} Drive files skipped twice; "
        f"documents={len(after['doc_rows'])} chunks={len(after['chunk_rows'])} unchanged."
    )


def _as_drive_time(stored: str) -> str:
    parsed = datetime.fromisoformat(stored.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _db_snapshot(supabase) -> dict:
    return {
        "doc_rows": _paged(
            supabase,
            "documents",
            "id, drive_file_id, drive_modified_time, content_hash, title, storage_path, mime_type, source_type",
        ),
        "chunk_rows": _paged(supabase, "chunks", "id, document_id, created_at"),
    }


def _paged(supabase, table: str, columns: str) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        page = (
            supabase.table(table)
            .select(columns)
            .order("id")
            .range(start, start + 999)
            .execute()
            .data
            or []
        )
        rows.extend(page)
        if len(page) < 1000:
            return rows
        start += 1000


def _run_all() -> None:
    tests = [
        test_modified_times_match_drive_and_supabase_formats,
        test_supported_types_and_unsupported,
        test_walks_nested_folders_once,
        test_unchanged_file_is_not_downloaded_or_ingested,
        test_new_and_changed_files_use_existing_ingest_once,
        test_second_run_creates_no_embeddings_or_rows,
        test_download_failure_does_not_ingest,
        test_same_bytes_updates_modified_time_without_new_rows,
        test_service_account_json_parsing,
        test_missing_credentials_exit,
        test_summary_zero_line,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    print(f"{len(tests)} tests passed")


if __name__ == "__main__":
    _run_all()
    if os.getenv("TIS_DRIVE_LIVE") == "1":
        verify_live_database_idempotency()
