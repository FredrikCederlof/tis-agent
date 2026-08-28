from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from tis_agent.clients import make_supabase
from tis_agent.config import Settings, get_settings
from tis_agent.ingest_document import IngestResult, ingest_bytes, ingest_path
from tis_agent.storage import STORAGE_BUCKET, storage_object_path, upload_bytes


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

    sub.add_parser("local-handbook", help="Re-sync the local handbook PDF (legacy).")

    bulletin_cmd = sub.add_parser(
        "bulletin",
        help="Sanitize a school-mail dump and ingest it as the weekly bulletin.",
    )
    bulletin_cmd.add_argument("path", type=Path)
    bulletin_cmd.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the JSON summary and write sanitized markdown without ingesting.",
    )
    bulletin_cmd.add_argument(
        "--sanitized-out",
        type=Path,
        default=Path("/tmp/tis-bulletin-sanitized.md"),
        help="Where to write sanitized markdown (default: /tmp/tis-bulletin-sanitized.md).",
    )
    bulletin_cmd.add_argument(
        "--date",
        help="Bulletin date YYYY-MM-DD (defaults to today in Asia/Tokyo).",
    )

    args = parser.parse_args(argv)

    if args.command == "bulletin":
        from datetime import date as date_type

        from tis_agent.bulletin import sync_bulletin_path

        as_of = date_type.fromisoformat(args.date) if args.date else None
        settings = None if args.dry_run else get_settings()
        summary = sync_bulletin_path(
            args.path,
            settings=settings,
            dry_run=args.dry_run,
            as_of=as_of,
            sanitized_out=args.sanitized_out,
        )
        print(json.dumps(summary, indent=2))
        return

    settings = get_settings()

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


if __name__ == "__main__":
    main()
