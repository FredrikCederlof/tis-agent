"""Knowledge Hub: one RAG document per curated Q&A entry."""

from __future__ import annotations

from datetime import date
from typing import Any
from unittest.mock import patch

from tis_agent.ask import Evidence, _rerank, select_dated_evidence
from tis_agent.config import Settings
from tis_agent.ingest_document import IngestResult, _chunks_from_bytes, content_hash, ingest_bytes
from tis_agent.knowledge import (
    KNOWLEDGE_SOURCE_TYPE,
    archive_knowledge_entry,
    chunk_knowledge_markdown,
    knowledge_drive_id,
    knowledge_markdown,
    normalize_entry_payload,
    save_knowledge_entry,
)
from tis_agent.temporal import parse_temporal


SETTINGS = Settings(
    supabase_url="https://example.supabase.co",
    supabase_secret_key="secret",
    openai_api_key="sk-test",
)

INBOX_ID = "11111111-1111-1111-1111-111111111111"
TODAY = date(2026, 8, 28)


def _markdown() -> str:
    return knowledge_markdown(
        primary_question="When does Grade 6 finish on Friday?",
        similar_questions=[
            "What time does G6 finish on Fridays?",
            "Grade 6 Friday dismissal time",
        ],
        answer="Grade 6 finishes at 2:30pm on Fridays.",
        tags=["dismissal", "grade 6"],
        source_note="Confirmed with TIS office",
    )


class Result:
    def __init__(self, data: Any):
        self.data = data


class FakeQuery:
    def __init__(self, db: dict[str, list[dict]], table: str):
        self.db = db
        self.table_name = table
        self._op = "select"
        self._payload: dict | None = None
        self._filters: dict[str, Any] = {}

    def select(self, *_args: Any, **_kwargs: Any) -> FakeQuery:
        self._op = "select"
        return self

    def insert(self, row: dict) -> FakeQuery:
        self._op = "insert"
        self._payload = dict(row)
        return self

    def update(self, row: dict) -> FakeQuery:
        self._op = "update"
        self._payload = dict(row)
        return self

    def delete(self) -> FakeQuery:
        self._op = "delete"
        return self

    def eq(self, key: str, value: Any) -> FakeQuery:
        self._filters[key] = value
        return self

    def limit(self, _n: int) -> FakeQuery:
        return self

    def execute(self) -> Result:
        rows = self.db.setdefault(self.table_name, [])
        if self._op == "insert":
            assert self._payload is not None
            row = dict(self._payload)
            row.setdefault("id", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
            rows.append(row)
            return Result([row])
        if self._op == "update":
            updated = []
            for row in rows:
                if all(row.get(key) == value for key, value in self._filters.items()):
                    row.update(self._payload or {})
                    updated.append(row)
            return Result(updated)
        if self._op == "delete":
            deleted = [
                row
                for row in rows
                if all(row.get(key) == value for key, value in self._filters.items())
            ]
            self.db[self.table_name] = [
                row
                for row in rows
                if not all(row.get(key) == value for key, value in self._filters.items())
            ]
            return Result(deleted)
        found = rows
        for key, value in self._filters.items():
            found = [row for row in found if row.get(key) == value]
        return Result(found)


class FakeClient:
    def __init__(self) -> None:
        self.db: dict[str, list[dict]] = {
            "knowledge_entries": [],
            "interactions": [{"id": INBOX_ID, "reviewed_at": None, "knowledge_entry_id": None}],
            "documents": [],
        }

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.db, name)


def _ev(**kwargs: Any) -> Evidence:
    defaults = dict(
        content="",
        section_title=None,
        page_start=1,
        page_end=1,
        document_title="Community Handbook 2026-2027",
        similarity=0.5,
        source_type="handbook",
        start_date=None,
        end_date=None,
    )
    defaults.update(kwargs)
    return Evidence(**defaults)


def test_markdown_keeps_one_answer_and_similar_questions() -> None:
    body = _markdown()
    assert body.count("## Answer") == 1
    assert "Grade 6 finishes at 2:30pm on Fridays." in body
    assert "What time does G6 finish on Fridays?" in body
    assert "Grade 6 Friday dismissal time" in body
    chunks = chunk_knowledge_markdown(body)
    assert len(chunks) == 1
    assert chunks[0] == body.strip()


def test_knowledge_ingest_builds_one_chunk() -> None:
    body = _markdown()
    chunks, pages = _chunks_from_bytes(
        body.encode("utf-8"),
        "text/markdown",
        source_type=KNOWLEDGE_SOURCE_TYPE,
    )
    assert pages is None
    assert len(chunks) == 1
    assert "Similar questions" in chunks[0].content
    assert chunks[0].content.count("## Answer") == 1
    assert chunks[0].section_title == "Knowledge Hub"


def test_unchanged_knowledge_hash_is_stable() -> None:
    first = content_hash(_markdown().encode("utf-8"))
    second = content_hash(_markdown().encode("utf-8"))
    assert first == second


def test_ingest_bytes_skips_unchanged_knowledge() -> None:
    payload = _markdown().encode("utf-8")
    digest = content_hash(payload)

    class Existing:
        def table(self, _name: str) -> Existing:
            return self

        def select(self, *_args: Any) -> Existing:
            return self

        def eq(self, *_args: Any) -> Existing:
            return self

        def limit(self, _n: int) -> Existing:
            return self

        def execute(self) -> Result:
            return Result(
                [
                    {
                        "id": "doc-existing",
                        "content_hash": digest,
                        "storage_path": "knowledge/entry.md",
                    }
                ]
            )

    with (
        patch("tis_agent.ingest_document.make_supabase", return_value=Existing()),
        patch("tis_agent.ingest_document.make_openai", return_value=object()),
    ):
        result = ingest_bytes(
            SETTINGS,
            data=payload,
            title="When does Grade 6 finish on Friday?",
            mime_type="text/markdown",
            storage_path="knowledge/entry.md",
            drive_file_id=knowledge_drive_id("entry"),
            source_type=KNOWLEDGE_SOURCE_TYPE,
        )
    assert result.skipped is True
    assert result.document_id == "doc-existing"
    assert result.chunks == 0


def test_inbox_origin_requires_interaction_and_marks_reviewed() -> None:
    payload = normalize_entry_payload(
        {
            "primary_question": "When does Grade 6 finish on Friday?",
            "answer": "Grade 6 finishes at 2:30pm on Fridays.",
            "origin": "inbox",
            "origin_interaction_id": INBOX_ID,
            "updated_by": "fredrik@example.com",
        }
    )
    assert payload["origin"] == "inbox"
    assert payload["origin_interaction_id"] == INBOX_ID

    client = FakeClient()

    def fake_ingest(*_args: Any, **kwargs: Any) -> IngestResult:
        return IngestResult(
            document_id="doc-1",
            title=kwargs["title"],
            chunks=1,
            pages=None,
            storage_path=kwargs["storage_path"],
            skipped=False,
        )

    with (
        patch("tis_agent.knowledge.make_supabase", return_value=client),
        patch("tis_agent.knowledge.ingest_bytes", side_effect=fake_ingest),
    ):
        result = save_knowledge_entry(
            {
                "primary_question": "When does Grade 6 finish on Friday?",
                "similar_questions": ["What time does G6 finish on Fridays?"],
                "answer": "Grade 6 finishes at 2:30pm on Fridays.",
                "origin": "inbox",
                "origin_interaction_id": INBOX_ID,
                "updated_by": "fredrik@example.com",
            },
            settings=SETTINGS,
        )

    assert result["status"] == "synced"
    assert result["entry"]["origin"] == "inbox"
    assert result["entry"]["origin_interaction_id"] == INBOX_ID
    interaction = client.db["interactions"][0]
    assert interaction["knowledge_entry_id"] == result["entry"]["id"]
    assert interaction["reviewed_at"]
    assert interaction["reviewed_by"] == "fredrik@example.com"


def test_save_is_idempotent_when_ingest_skips() -> None:
    client = FakeClient()
    client.db["knowledge_entries"].append(
        {
            "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "origin": "manual",
            "origin_interaction_id": None,
        }
    )

    def fake_ingest(*_args: Any, **kwargs: Any) -> IngestResult:
        return IngestResult(
            document_id="doc-1",
            title=kwargs["title"],
            chunks=0,
            pages=None,
            storage_path=kwargs["storage_path"],
            skipped=True,
        )

    with (
        patch("tis_agent.knowledge.make_supabase", return_value=client),
        patch("tis_agent.knowledge.ingest_bytes", side_effect=fake_ingest),
    ):
        result = save_knowledge_entry(
            {
                "primary_question": "When does Grade 6 finish on Friday?",
                "answer": "Grade 6 finishes at 2:30pm on Fridays.",
            },
            entry_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            settings=SETTINGS,
        )
    assert result["status"] == "skipped"
    assert result["ingest"]["skipped"] is True


def test_archive_deletes_linked_document() -> None:
    client = FakeClient()
    client.db["knowledge_entries"].append(
        {
            "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "document_id": "doc-1",
            "status": "active",
        }
    )
    client.db["documents"].append({"id": "doc-1", "source_type": "knowledge"})

    with patch("tis_agent.knowledge.make_supabase", return_value=client):
        result = archive_knowledge_entry(
            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            updated_by="fredrik@example.com",
            settings=SETTINGS,
        )

    assert result["status"] == "archived"
    assert client.db["documents"] == []
    entry = client.db["knowledge_entries"][0]
    assert entry["status"] == "archived"
    assert entry["document_id"] is None


def test_dated_retrieve_keeps_knowledge_for_friday_dismissal() -> None:
    temporal = parse_temporal("When does Grade 6 finish on Friday?", today=TODAY)
    assert temporal.kind == "date_anchored"
    knowledge = _ev(
        content=(
            "# When does Grade 6 finish on Friday?\n\n"
            "## Similar questions\n"
            "- What time does G6 finish on Fridays?\n\n"
            "## Answer\n\n"
            "Grade 6 finishes at 2:30pm on Fridays."
        ),
        document_title="When does Grade 6 finish on Friday?",
        source_type="knowledge",
        similarity=0.61,
        start_date=date(2026, 9, 4),
        end_date=date(2026, 9, 4),
    )
    handbook = _ev(
        content="If your child is going to be absent, submit an attendance excusal on Toddle.",
        similarity=0.72,
    )
    calendar = _ev(
        content="Event: Day 5\nStarts: 2026-08-28 (all day)",
        section_title="Day 5",
        document_title="TIS Parent Calendar",
        source_type="calendar",
        start_date=TODAY,
        end_date=TODAY,
        similarity=0.99,
    )
    selected = select_dated_evidence([handbook, knowledge, calendar], temporal)
    assert any(item.source_type == "knowledge" for item in selected)
    assert not any(item.source_type == "handbook" for item in selected)


def test_rerank_boosts_knowledge_above_handbook() -> None:
    temporal = parse_temporal("When does Grade 6 finish on Friday?", today=TODAY)
    knowledge = _ev(
        content="Grade 6 finishes at 2:30pm on Fridays.",
        document_title="When does Grade 6 finish on Friday?",
        source_type="knowledge",
        similarity=0.55,
    )
    handbook = _ev(
        content="School hours vary by grade. See the daily schedule.",
        similarity=0.7,
    )
    ranked = _rerank([handbook, knowledge], temporal)
    assert ranked[0].source_type == "knowledge"


def test_normalize_rejects_inbox_without_interaction() -> None:
    try:
        normalize_entry_payload(
            {
                "primary_question": "When does Grade 6 finish on Friday?",
                "answer": "2:30pm",
                "origin": "inbox",
            }
        )
    except ValueError as exc:
        assert "origin_interaction_id" in str(exc)
    else:
        raise AssertionError("expected ValueError")
