"""Authenticated sync for login-gated content on portal.tokyois.com (WordPress + Ultimate Member)."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import httpx

from tis_agent.html_text import extract_same_site_links, html_to_text

logger = logging.getLogger("tis_agent.portal_sync")

USER_AGENT = "TIS-Agent-KnowledgeSync/1.0 (+https://github.com/FredrikCederlof/tis-agent)"

PORTAL_BASE = "https://portal.tokyois.com"
DEFAULT_LOGIN_URL = f"{PORTAL_BASE}/"
DEFAULT_FORWARD_DAYS = 30


class PortalLoginError(RuntimeError):
    """Raised when portal authentication fails."""


class PortalCredentialsMissing(PortalLoginError):
    """Raised when TIS_PORTAL_USERNAME / TIS_PORTAL_PASSWORD are not set."""


def get_portal_credentials() -> tuple[str, str]:
    username = os.getenv("TIS_PORTAL_USERNAME", "").strip()
    password = os.getenv("TIS_PORTAL_PASSWORD", "").strip()
    if not username or not password:
        raise PortalCredentialsMissing(
            "Set TIS_PORTAL_USERNAME and TIS_PORTAL_PASSWORD in the environment "
            "(local .env or Railway secrets) to sync login-gated portal content."
        )
    return username, password


def _is_login_page(html: str) -> bool:
    lower = html.lower()
    return "um-login" in lower or "tis portal login" in lower


def _parse_hidden_inputs(html: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for match in re.finditer(
        r'<input[^>]+type=["\']hidden["\'][^>]*>',
        html,
        flags=re.IGNORECASE,
    ):
        tag = match.group(0)
        name_m = re.search(r'name=["\']([^"\']+)["\']', tag, flags=re.IGNORECASE)
        if not name_m:
            continue
        name = name_m.group(1)
        value_m = re.search(r'value=["\']([^"\']*)["\']', tag, flags=re.IGNORECASE)
        fields[name] = value_m.group(1) if value_m else ""
    return fields


def _parse_um_form_id(html: str) -> str | None:
    match = re.search(r'name=["\']username-(\d+)["\']', html, flags=re.IGNORECASE)
    return match.group(1) if match else None


def build_login_payload(html: str, username: str, password: str) -> dict[str, str]:
    """Build Ultimate Member login POST body from a login page HTML."""
    form_id = _parse_um_form_id(html)
    if not form_id:
        raise PortalLoginError("Could not find Ultimate Member login form on portal page")

    payload = _parse_hidden_inputs(html)
    payload[f"username-{form_id}"] = username
    payload[f"user_password-{form_id}"] = password
    payload["form_id"] = form_id
    payload.setdefault("redirect_to", f"{PORTAL_BASE}/tis-times/")
    payload.setdefault("um_request", "")
    return payload


def login_portal(
    client: httpx.Client,
    *,
    username: str,
    password: str,
    login_url: str = DEFAULT_LOGIN_URL,
    redirect_to: str = f"{PORTAL_BASE}/tis-times/",
) -> None:
    """Authenticate the httpx client against the TIS parent portal."""
    response = client.get(login_url, follow_redirects=True)
    response.raise_for_status()
    html = response.text

    if not _is_login_page(html):
        # Already logged in (session cookie) or unexpected page — probe target URL.
        probe = client.get(redirect_to, follow_redirects=True)
        probe.raise_for_status()
        if not _is_login_page(probe.text):
            logger.info("Portal session already authenticated")
            return
        html = probe.text

    payload = build_login_payload(html, username, password)
    payload["redirect_to"] = redirect_to

    post_url = str(response.url)
    login_response = client.post(post_url, data=payload, follow_redirects=True)
    login_response.raise_for_status()

    # UM often returns login HTML even when cookies are set; verify with the target page.
    probe = client.get(redirect_to, follow_redirects=True)
    probe.raise_for_status()
    if _is_login_page(probe.text):
        raise PortalLoginError(
            "Portal login failed — could not access protected content. "
            "Check TIS_PORTAL_USERNAME and TIS_PORTAL_PASSWORD."
        )


def make_portal_client() -> httpx.Client:
    return httpx.Client(
        timeout=60.0,
        follow_redirects=True,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
        },
    )


def _forward_window(*, forward_days: int = DEFAULT_FORWARD_DAYS) -> tuple[datetime, datetime]:
    tz = ZoneInfo("Asia/Tokyo")
    now = datetime.now(tz)
    window_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    window_end = window_start + timedelta(days=forward_days, hours=23, minutes=59, seconds=59)
    return window_start, window_end


def _extract_datetimes(html: str) -> list[datetime]:
    tz = ZoneInfo("Asia/Tokyo")
    dates: list[datetime] = []
    for match in re.finditer(r'<time[^>]+datetime="([^"]+)"', html, flags=re.IGNORECASE):
        raw = match.group(1).strip()
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        dates.append(dt.astimezone(tz))
    return dates


def _page_in_forward_window(html: str, *, forward_days: int = DEFAULT_FORWARD_DAYS) -> bool:
    """Include page when any embedded date falls from today through forward_days ahead."""
    window_start, window_end = _forward_window(forward_days=forward_days)
    dates = _extract_datetimes(html)
    if not dates:
        return True
    return any(window_start <= dt <= window_end for dt in dates)


def _all_dates_before_window(html: str, *, forward_days: int = DEFAULT_FORWARD_DAYS) -> bool:
    """True when every date on the page is before today (older news listings)."""
    window_start, _ = _forward_window(forward_days=forward_days)
    dates = _extract_datetimes(html)
    if not dates:
        return False
    return all(dt < window_start for dt in dates)


def crawl_portal_section(
    client: httpx.Client,
    start_url: str,
    *,
    path_prefix: str,
    max_pages: int = 40,
    forward_days: int = DEFAULT_FORWARD_DAYS,
) -> tuple[str, int]:
    """Fetch and extract text from portal pages under path_prefix using an authenticated client."""
    queue = [start_url]
    seen: set[str] = set()
    sections: list[str] = []

    while queue and len(seen) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        try:
            response = client.get(url)
            response.raise_for_status()
        except Exception:
            logger.exception("Failed to fetch portal page %s", url)
            continue

        html = response.text
        if _is_login_page(html):
            raise PortalLoginError(f"Session expired or denied access to {url}")

        in_window = _page_in_forward_window(html, forward_days=forward_days)
        text = html_to_text(html)
        if in_window and text.strip():
            sections.append(f"## Source page: {url}\n\n{text.strip()}")

        stop_pagination = _all_dates_before_window(html, forward_days=forward_days)
        for link in extract_same_site_links(html, str(response.url), path_prefix=path_prefix):
            parsed = urlparse(link)
            if parsed.path.startswith("/wp-admin") or parsed.path.startswith("/wp-login"):
                continue
            if stop_pagination and "/page/" in link:
                continue
            if link not in seen and link not in queue:
                queue.append(link)

    combined = "\n\n".join(sections).strip()
    if not combined:
        window_start, window_end = _forward_window(forward_days=forward_days)
        combined = (
            f"TIS Times (Parent Portal)\n"
            f"No posts dated between {window_start.date().isoformat()} and "
            f"{window_end.date().isoformat()}.\n"
        )
    return combined, len(seen)


def fetch_portal_section_text(
    start_url: str,
    *,
    path_prefix: str | None = None,
    max_pages: int = 40,
    forward_days: int = DEFAULT_FORWARD_DAYS,
    username: str | None = None,
    password: str | None = None,
) -> tuple[str, int]:
    """Log in and crawl a portal section; returns combined text and page count."""
    user, pwd = (
        (username, password)
        if username is not None and password is not None
        else get_portal_credentials()
    )
    prefix = path_prefix or start_url.rstrip("/")

    with make_portal_client() as client:
        login_portal(client, username=user, password=pwd, redirect_to=start_url)
        return crawl_portal_section(
            client,
            start_url,
            path_prefix=prefix,
            max_pages=max_pages,
            forward_days=forward_days,
        )
