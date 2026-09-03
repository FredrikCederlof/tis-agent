"""Render WhatsApp-formatted replies as HTML — keep in sync with admin/lib/wa-markup.ts.

Tina writes for WhatsApp: *bold*, _italic_, ~strike~, `mono`, "- " bullets and
blank-line paragraphs. Admin renders that as real HTML so a long reply is readable.
"""

from __future__ import annotations

import re
from html import escape
from typing import Any

BULLET = re.compile(r"^\s*[-•*]\s+(.*)$")
ORDERED = re.compile(r"^\s*(\d{1,2})[.)]\s+(.*)$")

_INLINE = (
    ("code", re.compile(r"`([^`\n]+)`")),
    ("bold", re.compile(r"(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])")),
    ("italic", re.compile(r"(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])")),
    ("strike", re.compile(r"(?<![\w~])~(?!\s)([^~\n]+?)(?<!\s)~(?![\w~])")),
)

_TAGS = {"bold": "strong", "italic": "em", "strike": "s", "code": "code"}


def tokenize_inline(text: str) -> list[dict[str, str]]:
    """Split one line into plain-text and formatted spans (single level)."""
    tokens: list[dict[str, str]] = []
    rest = text
    while rest:
        best_kind = ""
        best_match: re.Match[str] | None = None
        for kind, pattern in _INLINE:
            match = pattern.search(rest)
            if match and (best_match is None or match.start() < best_match.start()):
                best_kind, best_match = kind, match
        if best_match is None:
            tokens.append({"kind": "text", "text": rest})
            break
        if best_match.start() > 0:
            tokens.append({"kind": "text", "text": rest[: best_match.start()]})
        tokens.append({"kind": best_kind, "text": best_match.group(1)})
        rest = rest[best_match.end() :]
    return [token for token in tokens if token["text"]]


def parse_blocks(text: str) -> list[dict[str, Any]]:
    """Group a reply into paragraph and list blocks, keeping soft line breaks."""
    blocks: list[dict[str, Any]] = []
    paragraph: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            blocks.append(
                {
                    "type": "paragraph",
                    "lines": [tokenize_inline(line) for line in paragraph],
                }
            )
            paragraph.clear()

    for raw_line in (text or "").replace("\r\n", "\n").split("\n"):
        line = raw_line.rstrip()
        if not line.strip():
            flush_paragraph()
            continue

        ordered = ORDERED.match(line)
        bullet = None if ordered else BULLET.match(line)
        if ordered or bullet:
            item = (ordered.group(2) if ordered else bullet.group(1)).strip()  # type: ignore[union-attr]
            is_ordered = ordered is not None
            flush_paragraph()
            last = blocks[-1] if blocks else None
            if last and last["type"] == "list" and last["ordered"] == is_ordered:
                last["items"].append(tokenize_inline(item))
            else:
                blocks.append(
                    {"type": "list", "ordered": is_ordered, "items": [tokenize_inline(item)]}
                )
            continue

        paragraph.append(line.strip())

    flush_paragraph()
    return blocks


def _render_inline(tokens: list[dict[str, str]]) -> str:
    parts: list[str] = []
    for token in tokens:
        body = escape(token["text"])
        tag = _TAGS.get(token["kind"])
        parts.append(f"<{tag}>{body}</{tag}>" if tag else body)
    return "".join(parts)


def render_html(text: str) -> str:
    """HTML for one Tina or admin message body."""
    html: list[str] = []
    for block in parse_blocks(text):
        if block["type"] == "list":
            tag = "ol" if block["ordered"] else "ul"
            items = "".join(f"<li>{_render_inline(item)}</li>" for item in block["items"])
            html.append(f"<{tag}>{items}</{tag}>")
            continue
        lines = "<br />".join(_render_inline(line) for line in block["lines"])
        html.append(f"<p>{lines}</p>")
    return "".join(html)
