"""Tests for Drive link extraction and bulletin linked-file ingest."""

from __future__ import annotations

from pathlib import Path

from tis_agent.bulletin_links import (
    extract_drive_links,
    sync_linked_drive_files,
)
from tis_agent.config import Settings
from tis_agent.drive_sync import DriveItem
from tis_agent.sync import SyncFileResult


PACKING_ID = "15da0a1L5mh-RoFMhTgp7uDsB4v5Ipqvb"
LETTER_ID = "1hZUwZktYQX5iKSYfqcfHrV8J86KM0-3x"
DOC_ID = "1B6rgiWY-kbHINUjqr8-kExaeN4Saa0yK4qtGJOz9-_A"


def test_extract_drive_links_dedupes_and_keeps_order() -> None:
    text = f"""
Packing list: https://drive.google.com/file/d/{PACKING_ID}/view?usp=sharing
Letter: https://drive.google.com/file/d/{LETTER_ID}/view?usp=drive_web
Same packing again: https://drive.google.com/file/d/{PACKING_ID}/view
Handbook: https://docs.google.com/document/d/{DOC_ID}/edit?usp=sharing
Form (ignored): https://forms.gle/E3Acy7EwPr4XDPkL6
"""
    links = extract_drive_links(text)
    assert [link.file_id for link in links] == [PACKING_ID, LETTER_ID, DOC_ID]


def test_extract_drive_open_id_query() -> None:
    text = f"https://drive.google.com/open?id={PACKING_ID}&usp=sharing"
    links = extract_drive_links(text)
    assert len(links) == 1
    assert links[0].file_id == PACKING_ID


class _FakeLinkDrive:
    def __init__(self) -> None:
        self.items = {
            PACKING_ID: DriveItem(
                id=PACKING_ID,
                name="MS Packing List.pdf",
                mime_type="application/pdf",
                modified_time="2026-10-02T01:27:03.162Z",
            ),
            DOC_ID: DriveItem(
                id=DOC_ID,
                name="Community Handbook",
                mime_type="application/vnd.google-apps.document",
                modified_time="2026-10-01T00:00:00.000Z",
            ),
        }
        self.blobs = {
            PACKING_ID: b"%PDF-1.4 packing",
            DOC_ID: b"Handbook body",
        }
        self.downloads: list[str] = []
        self.exports: list[str] = []

    def list_children(self, folder_id: str) -> list[DriveItem]:
        return []

    def get_metadata(self, file_id: str) -> DriveItem:
        return self.items[file_id]

    def download(self, file_id: str) -> bytes:
        self.downloads.append(file_id)
        return self.blobs[file_id]

    def export_text(self, file_id: str) -> bytes:
        self.exports.append(file_id)
        return self.blobs[file_id]


def test_sync_linked_drive_files_ingests_pdf_and_doc() -> None:
    client = _FakeLinkDrive()
    calls: list[dict] = []

    def fake_sync(settings, path: Path, **kwargs):
        calls.append({"path": path.name, **kwargs})
        data = path.read_bytes()
        assert data
        return SyncFileResult(
            title=kwargs["title"],
            drive_file_id=kwargs.get("drive_file_id"),
            storage_path=f"sources/{path.name}",
            status="synced",
            chunks=3,
            document_id="doc-1",
        )

    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_secret_key="test",
        openai_api_key="sk-test",
    )
    text = (
        f"See https://drive.google.com/file/d/{PACKING_ID}/view and "
        f"https://docs.google.com/document/d/{DOC_ID}/edit"
    )
    summary = sync_linked_drive_files(
        settings,
        text,
        client=client,
        sync_file=fake_sync,
    )
    assert summary.discovered == 2
    assert summary.synced == 2
    assert summary.failed == 0
    assert client.downloads == [PACKING_ID]
    assert client.exports == [DOC_ID]
    titles = {call["title"] for call in calls}
    assert titles == {"MS Packing List", "Community Handbook"}
    assert calls[0]["mime_type"] == "application/pdf"
    assert calls[1]["mime_type"] == "text/plain"
