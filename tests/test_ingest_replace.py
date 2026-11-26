"""A failed re-ingest must not delete the document parents already rely on."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from tis_agent.config import Settings
from tis_agent.ingest_document import ingest_bytes

SETTINGS = Settings(
    supabase_url="https://example.supabase.co",
    supabase_secret_key="secret",
    openai_api_key="sk-test",
)

OLD_ID = "doc-old"
NEW_ID = "doc-new"
DRIVE_ID = "drive-calendar"


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    def __init__(self, client: "_Store", table: str) -> None:
        self.client = client
        self.table = table
        self.op = "select"
        self.payload: Any = None
        self.filters: list[tuple[str, str]] = []

    def select(self, *_args: Any) -> _Query:
        self.op = "select"
        return self

    def insert(self, payload: Any) -> _Query:
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload: Any) -> _Query:
        self.op = "update"
        self.payload = payload
        return self

    def delete(self) -> _Query:
        self.op = "delete"
        return self

    def eq(self, key: str, value: str) -> _Query:
        self.filters.append((key, value))
        return self

    def limit(self, _n: int) -> _Query:
        return self

    def execute(self) -> _Result:
        self.client.ops.append(
            (self.table, self.op, self.payload, list(self.filters))
        )
        if self.table == "documents" and self.op == "select":
            row = self.client.existing
            return _Result([row] if row else [])
        if self.table == "documents" and self.op == "insert":
            stored = dict(self.payload)
            stored["id"] = NEW_ID
            self.client.inserted = stored
            return _Result([stored])
        if self.table == "chunks" and self.op == "insert" and self.client.fail_chunks:
            raise RuntimeError("chunk insert failed")
        return _Result([])


class _Store:
    def __init__(self, existing: dict[str, Any] | None, *, fail_chunks: bool = False) -> None:
        self.existing = existing
        self.fail_chunks = fail_chunks
        self.ops: list[tuple[Any, ...]] = []
        self.inserted: dict[str, Any] | None = None

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def _existing() -> dict[str, str]:
    return {
        "id": OLD_ID,
        "content_hash": "previous-handbook",
        "storage_path": "web/calendar.ics",
        "drive_file_id": DRIVE_ID,
    }


def _ops(store: _Store) -> list[tuple[str, str]]:
    return [(table, op) for table, op, _payload, _filters in store.ops]


def test_bad_calendar_download_keeps_the_stored_document() -> None:
    store = _Store(_existing())
    with patch("tis_agent.ingest_document.make_supabase", return_value=store):
        with pytest.raises(ValueError, match="No events extracted"):
            ingest_bytes(
                SETTINGS,
                data=b"<html>temporary error</html>",
                title="TIS Parent Calendar",
                mime_type="text/calendar",
                storage_path="web/calendar.ics",
                drive_file_id=DRIVE_ID,
                source_type="calendar",
            )

    assert ("documents", "delete") not in _ops(store)
    assert ("documents", "insert") not in _ops(store)


def test_embedding_failure_keeps_the_stored_document() -> None:
    store = _Store(_existing())
    with (
        patch("tis_agent.ingest_document.make_supabase", return_value=store),
        patch(
            "tis_agent.ingest_document.embed_texts",
            side_effect=RuntimeError("openai 429"),
        ),
    ):
        with pytest.raises(RuntimeError, match="openai 429"):
            ingest_bytes(
                SETTINGS,
                data=b"Parents, the winter concert is on Friday at 18:00.",
                title="TIS Parent Calendar",
                mime_type="text/plain",
                storage_path="web/calendar.txt",
                drive_file_id=DRIVE_ID,
                source_type="calendar",
            )

    assert ("documents", "delete") not in _ops(store)
    assert ("documents", "insert") not in _ops(store)


def test_replacement_is_stored_before_the_old_document_is_deleted() -> None:
    store = _Store(_existing())
    with (
        patch("tis_agent.ingest_document.make_supabase", return_value=store),
        patch(
            "tis_agent.ingest_document.embed_texts",
            return_value=[[0.1, 0.2]],
        ),
    ):
        result = ingest_bytes(
            SETTINGS,
            data=b"Parents, the winter concert moved to Saturday at 18:00.",
            title="TIS Parent Calendar",
            mime_type="text/plain",
            storage_path="web/calendar.txt",
            drive_file_id=DRIVE_ID,
            drive_modified_time="2026-11-26T00:00:00Z",
            source_type="calendar",
        )

    assert result.skipped is False
    assert result.document_id == NEW_ID
    assert store.inserted is not None
    assert store.inserted["drive_file_id"] is None

    sequence = _ops(store)
    insert_at = sequence.index(("documents", "insert"))
    chunks_at = sequence.index(("chunks", "insert"))
    delete_at = sequence.index(("documents", "delete"))
    update_at = sequence.index(("documents", "update"))
    assert insert_at < chunks_at < delete_at < update_at

    deleted = [filters for table, op, _payload, filters in store.ops if op == "delete"]
    assert deleted == [[("id", OLD_ID)]]
    updated = [
        (payload, filters)
        for table, op, payload, filters in store.ops
        if op == "update"
    ]
    assert updated == [({"drive_file_id": DRIVE_ID}, [("id", NEW_ID)])]


def test_chunk_insert_failure_drops_the_replacement_and_keeps_the_old_document() -> None:
    store = _Store(_existing(), fail_chunks=True)
    with (
        patch("tis_agent.ingest_document.make_supabase", return_value=store),
        patch(
            "tis_agent.ingest_document.embed_texts",
            return_value=[[0.1, 0.2]],
        ),
    ):
        with pytest.raises(RuntimeError, match="chunk insert failed"):
            ingest_bytes(
                SETTINGS,
                data=b"Parents, the winter concert moved to Saturday at 18:00.",
                title="TIS Parent Calendar",
                mime_type="text/plain",
                storage_path="web/calendar.txt",
                drive_file_id=DRIVE_ID,
                source_type="calendar",
            )

    deletes = [
        filters
        for table, op, _payload, filters in store.ops
        if table == "documents" and op == "delete"
    ]
    assert deletes == [[("id", NEW_ID)]]
