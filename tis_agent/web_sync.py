"""Fetch public web pages and calendar feeds into the TIS knowledge base."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from tis_agent.config import Settings, get_settings
from tis_agent.html_text import extract_same_site_links, html_to_text
from tis_agent.ical_text import ics_to_text
from tis_agent.ingest_document import ingest_bytes
from tis_agent.storage import upload_bytes
from tis_agent.clients import make_supabase

logger = logging.getLogger("tis_agent.web_sync")

DEFAULT_SOURCES: list[dict[str, Any]] = [
    {
        "title": "TIS Tech Portal (IT Parent Help)",
        "url": "https://sites.google.com/tokyois.com/it-parent-help/home",
        "source_type": "web",
        "crawl": True,
        "path_prefix": "https://sites.google.com/tokyois.com/it-parent-help",
        "max_pages": 25,
    },
    {
        "title": "TIS Parent Calendar",
        "url": "https://calendar.google.com/calendar/ical/parents.calendar@tokyois.com/public/basic.ics",
        "source_type": "calendar",
        "kind": "ics",
    },
    {
        "title": "TIS School Uniform (Top of the Class)",
        "url": "https://schooluniform.jp/tokyo-international-school-tis/",
        "source_type": "web",
    },
]

USER_AGENT = "TIS-Agent-KnowledgeSync/1.0 (+https://github.com/FredrikCederlof/tis-agent)"


@dataclass
class WebSyncResult:
    title: str
    url: str
    status: str
    chunks: int = 0
    document_id: str | None = None
    pages_fetched: int = 1


def _source_id(url: str) -> str:
    return "url:" + hashlib.sha256(url.encode()).hexdigest()[:32]


def _storage_slug(url: str) -> str:
    path = urlparse(url).path.strip("/").replace("/", "_") or "index"
    return f"web/{path[:120]}.txt"


def _fetch_url(url: str) -> tuple[bytes, str]:
    response = httpx.get(
        url,
        timeout=60.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )
    response.raise_for_status()
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    return response.content, content_type


def _crawl_site_text(start_url: str, *, path_prefix: str, max_pages: int) -> tuple[str, int]:
    queue = [start_url]
    seen: set[str] = set()
    sections: list[str] = []

    while queue and len(seen) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            data, content_type = _fetch_url(url)
        except Exception:
            logger.exception("Failed to fetch %s", url)
            continue

        if "calendar" in content_type or url.endswith(".ics"):
            text = data.decode("utf-8", errors="replace")
        else:
            html = data.decode("utf-8", errors="replace")
            text = html_to_text(html)
            for link in extract_same_site_links(html, url, path_prefix=path_prefix):
                if link not in seen and link not in queue:
                    queue.append(link)

        if text.strip():
            sections.append(f"## Source page: {url}\n\n{text.strip()}")

    combined = "\n\n".join(sections).strip()
    if not combined:
        raise ValueError(f"No text extracted while crawling {start_url}")
    return combined, len(seen)


def sync_web_source(settings: Settings, source: dict[str, Any]) -> WebSyncResult:
    title = str(source["title"])
    url = str(source["url"])
    source_type = str(source.get("source_type") or "web")
    source_key = _source_id(url)
    modified_iso = datetime.now(timezone.utc).isoformat()

    if source.get("kind") == "ics" or url.endswith(".ics"):
        raw_bytes, _ = _fetch_url(url)
        text = ics_to_text(raw_bytes.decode("utf-8", errors="replace"))
        mime_type = "text/calendar"
        pages_fetched = 1
    elif source.get("crawl"):
        text, pages_fetched = _crawl_site_text(
            url,
            path_prefix=str(source["path_prefix"]),
            max_pages=int(source.get("max_pages") or 20),
        )
        mime_type = "text/plain"
    else:
        raw_bytes, content_type = _fetch_url(url)
        if "html" in content_type:
            text = html_to_text(raw_bytes.decode("utf-8", errors="replace"))
        else:
            text = raw_bytes.decode("utf-8", errors="replace")
        mime_type = "text/plain"
        pages_fetched = 1

    if not text.strip():
        raise ValueError(f"No text extracted from {url}")

    data = text.encode("utf-8")
    storage_path = _storage_slug(url)
    supabase = make_supabase(settings)
    upload_bytes(supabase, storage_path, data, content_type="text/plain")

    result = ingest_bytes(
        settings,
        data=data,
        title=title,
        mime_type=mime_type,
        storage_path=storage_path,
        drive_file_id=source_key,
        drive_modified_time=modified_iso,
        source_type=source_type,
    )

    status = "skipped" if result.skipped else "synced"
    return WebSyncResult(
        title=title,
        url=url,
        status=status,
        chunks=result.chunks,
        document_id=result.document_id,
        pages_fetched=pages_fetched,
    )


def sync_default_web_sources(settings: Settings | None = None) -> list[WebSyncResult]:
    settings = settings or get_settings()
    results: list[WebSyncResult] = []
    for source in DEFAULT_SOURCES:
        try:
            results.append(sync_web_source(settings, source))
        except Exception:
            logger.exception("Failed to sync web source %s", source.get("title"))
            results.append(
                WebSyncResult(
                    title=str(source.get("title") or source.get("url")),
                    url=str(source.get("url")),
                    status="failed",
                )
            )
    return results
