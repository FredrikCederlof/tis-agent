from __future__ import annotations

from tis_agent.config import Settings, get_settings
from tis_agent.ingest_document import ingest_path


def ingest_handbook(settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    if not settings.handbook_path.exists():
        raise SystemExit(f"Handbook PDF not found: {settings.handbook_path}")

    result = ingest_path(
        settings,
        settings.handbook_path,
        title=settings.handbook_title,
        mime_type="application/pdf",
        storage_path=f"sources/local/{settings.handbook_path.name}",
    )

    return {
        "document_id": result.document_id,
        "pages": result.pages,
        "chunks": result.chunks,
        "title": result.title,
        "skipped": result.skipped,
    }


def main() -> None:
    result = ingest_handbook()
    if result.get("skipped"):
        print(f"Skipped {result['title']} (unchanged).")
        return
    print(
        f"Ingested {result['title']}: "
        f"{result['pages']} pages → {result['chunks']} chunks "
        f"(document_id={result['document_id']})"
    )


if __name__ == "__main__":
    main()
