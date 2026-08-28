from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

from tis_agent.clients import make_supabase
from tis_agent.config import Settings, get_settings
from tis_agent.ingest_document import IngestResult, ingest_bytes, ingest_path
from tis_agent.storage import STORAGE_BUCKET, storage_object_path, upload_bytes
from tis_agent.temporal import tokyo_today


DRIVE_FOLDER_ID = "1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa"


@dataclass
class SyncFileResult:
    title: str
    drive_file_id: str | None
    storage_path: str
    status: str
    chunks: int = 0
    pages: int | None = None
    document_id: str | None = None


def sync_file_from_path(
    settings: Settings,
    path: Path,
    *,
    title: str,
    mime_type: str,
    drive_file_id: str | None = None,
    drive_modified_time: str | None = None,
    upload_storage: bool = True,
    source_type: str | None = None,
) -> SyncFileResult:
    data = path.read_bytes()
    storage_path = (
        storage_object_path(drive_file_id, path.name)
        if drive_file_id
        else f"sources/{path.name}"
    )

    if upload_storage:
        supabase = make_supabase(settings)
        upload_bytes(supabase, storage_path, data, content_type=mime_type)

    result = ingest_bytes(
        settings,
        data=data,
        title=title,
        mime_type=mime_type,
        storage_path=storage_path,
        drive_file_id=drive_file_id,
        drive_modified_time=drive_modified_time,
        source_type=source_type,
    )

    status = "skipped" if result.skipped else "synced"
    return SyncFileResult(
        title=result.title,
        drive_file_id=drive_file_id,
        storage_path=result.storage_path,
        status=status,
        chunks=result.chunks,
        pages=result.pages,
        document_id=result.document_id,
    )


@dataclass
class BulletinSyncResult:
    title: str
    status: str
    kept_blocks: int
    dropped_blocks: int
    child_mentions_removed: int
    chunks: int = 0
    document_id: str | None = None
    storage_path: str | None = None
    markdown: str | None = None


def sync_bulletin_from_text(
    raw: str,
    *,
    settings: Settings | None = None,
    title: str | None = None,
    dry_run: bool = False,
    upload_storage: bool = True,
) -> BulletinSyncResult:
    from tis_agent.bulletin import sanitize_bulletin

    week = tokyo_today().isoformat()
    resolved_title = title or f"TIS Weekly Bulletin {week}"
    sanitized = sanitize_bulletin(raw, week_label=week)
    if not sanitized.markdown.strip():
        return BulletinSyncResult(
            title=resolved_title,
            status="empty",
            kept_blocks=0,
            dropped_blocks=sanitized.dropped_blocks,
            child_mentions_removed=sanitized.child_mentions_removed,
        )

    if dry_run:
        return BulletinSyncResult(
            title=resolved_title,
            status="dry_run",
            kept_blocks=sanitized.kept_blocks,
            dropped_blocks=sanitized.dropped_blocks,
            child_mentions_removed=sanitized.child_mentions_removed,
            markdown=sanitized.markdown,
        )

    settings = settings or get_settings()
    data = sanitized.markdown.encode("utf-8")
    storage_path = f"sources/bulletins/{resolved_title.replace(' ', '-')}.md"
    if upload_storage:
        supabase = make_supabase(settings)
        upload_bytes(supabase, storage_path, data, content_type="text/markdown")
    ingested = ingest_bytes(
        settings,
        data=data,
        title=resolved_title,
        mime_type="text/markdown",
        storage_path=storage_path,
        source_type="bulletin",
    )
    return BulletinSyncResult(
        title=ingested.title,
        status="skipped" if ingested.skipped else "synced",
        kept_blocks=sanitized.kept_blocks,
        dropped_blocks=sanitized.dropped_blocks,
        child_mentions_removed=sanitized.child_mentions_removed,
        chunks=ingested.chunks,
        document_id=ingested.document_id,
        storage_path=ingested.storage_path,
    )


def list_sync_state(settings: Settings | None = None) -> list[dict]:
    settings = settings or get_settings()
    supabase = make_supabase(settings)
    response = (
        supabase.table("documents")
        .select(
            "id, title, drive_file_id, drive_modified_time, storage_path, content_hash, mime_type, source_type, created_at"
        )
        .order("title")
        .execute()
    )
    return response.data or []


def print_sync_state(settings: Settings | None = None) -> None:
    rows = list_sync_state(settings)
    if not rows:
        print("No synced documents yet.")
        return
    for row in rows:
        print(
            f"- {row['title']} | drive={row.get('drive_file_id') or 'local'} | "
            f"modified={row.get('drive_modified_time') or 'n/a'} | "
            f"storage={row.get('storage_path') or 'n/a'}"
        )


def main(argv: list[str] | None = None) -> None:
    import sys

    parser = argparse.ArgumentParser(description="Sync TIS knowledge files into Supabase.")
    sub = parser.add_subparsers(dest="command", required=True)

    file_cmd = sub.add_parser("file", help="Upload + vectorize one local file.")
    file_cmd.add_argument("path", type=Path)
    file_cmd.add_argument("--title", required=True)
    file_cmd.add_argument("--mime-type", required=True)
    file_cmd.add_argument("--drive-id")
    file_cmd.add_argument("--modified")

    sub.add_parser("state", help="Show synced document metadata.")

    web_cmd = sub.add_parser("web", help="Sync configured public web/calendar sources.")
    web_cmd.add_argument(
        "--url",
        help="Sync one URL instead of the default source list.",
    )
    web_cmd.add_argument(
        "--title",
        help="Title when using --url (required with --url).",
    )
    web_cmd.add_argument(
        "--source-type",
        default="web",
        help="Source type metadata when using --url.",
    )

    bulletin_cmd = sub.add_parser(
        "bulletin",
        help="Sanitize school mail and ingest as a weekly bulletin.",
    )
    bulletin_cmd.add_argument("path", type=Path, nargs="?")
    bulletin_cmd.add_argument(
        "--stdin",
        action="store_true",
        help="Read the raw mail dump from stdin.",
    )
    bulletin_cmd.add_argument("--title", help="Document title (default: TIS Weekly Bulletin YYYY-MM-DD).")
    bulletin_cmd.add_argument(
        "--dry-run",
        action="store_true",
        help="Sanitize and print markdown; do not upload or embed.",
    )

    sub.add_parser("local-handbook", help="Re-sync the local handbook PDF (legacy).")

    args = parser.parse_args(argv)
    dry_run = bool(getattr(args, "dry_run", False))
    settings = None if args.command == "bulletin" and dry_run else get_settings()

    if args.command == "state":
        print_sync_state(settings)
        return

    if args.command == "local-handbook":
        result = ingest_path(settings, settings.handbook_path, title=settings.handbook_title)
        print(
            json.dumps(
                {
                    "title": result.title,
                    "document_id": result.document_id,
                    "chunks": result.chunks,
                    "pages": result.pages,
                    "storage_path": result.storage_path,
                    "skipped": result.skipped,
                },
                indent=2,
            )
        )
        return

    if args.command == "file":
        result = sync_file_from_path(
            settings,
            args.path,
            title=args.title,
            mime_type=args.mime_type,
            drive_file_id=args.drive_id,
            drive_modified_time=args.modified,
        )
        print(json.dumps(asdict(result), indent=2))
        return

    if args.command == "web":
        from dataclasses import asdict as dc_asdict
        from tis_agent.web_sync import WebSyncResult, sync_default_web_sources, sync_web_source

        if args.url:
            if not args.title:
                raise SystemExit("--title is required with --url")
            source = {
                "title": args.title,
                "url": args.url,
                "source_type": args.source_type,
            }
            if args.url.endswith(".ics"):
                source["kind"] = "ics"
            elif "portal.tokyois.com" in args.url:
                source["kind"] = "portal_auth"
                source["path_prefix"] = args.url.rstrip("/")
                source["max_pages"] = 40
            results = [sync_web_source(settings, source)]
        else:
            results = sync_default_web_sources(settings)
        print(json.dumps([dc_asdict(r) for r in results], indent=2))
        return

    if args.command == "bulletin":
        if args.stdin:
            raw = sys.stdin.read()
        elif args.path:
            raw = args.path.read_text(encoding="utf-8")
        else:
            raise SystemExit("Provide a file path or --stdin")
        result = sync_bulletin_from_text(
            raw,
            settings=settings,
            title=args.title,
            dry_run=dry_run,
        )
        payload = asdict(result)
        print(json.dumps(payload, indent=2))
        if result.status == "empty":
            raise SystemExit("Sanitized bulletin was empty; nothing ingested.")
        return


if __name__ == "__main__":
    main()
