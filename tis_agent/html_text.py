"""Extract readable text from HTML pages."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse


class _TextExtractor(HTMLParser):
    BLOCK_TAGS = frozenset(
        {"p", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "div", "tr", "section"}
    )
    SKIP_TAGS = frozenset({"script", "style", "noscript", "svg", "path"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
        elif tag in self.BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = data.strip()
        if text:
            self._parts.append(text)

    def text(self) -> str:
        raw = " ".join(self._parts)
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n\s*\n+", "\n\n", raw)
        return raw.strip()


def html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    return parser.text()


def extract_same_site_links(html: str, base_url: str, *, path_prefix: str) -> list[str]:
    """Find absolute links under the same site path prefix."""
    hrefs = re.findall(r'href="([^"]+)"', html)
    seen: set[str] = set()
    links: list[str] = []
    base_host = urlparse(base_url).netloc
    for href in hrefs:
        if href.startswith("#") or href.startswith("mailto:"):
            continue
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.netloc and parsed.netloc != base_host:
            continue
        if path_prefix not in absolute:
            continue
        if absolute.rstrip("/") == base_url.rstrip("/"):
            continue
        if absolute not in seen:
            seen.add(absolute)
            links.append(absolute)
    return links
