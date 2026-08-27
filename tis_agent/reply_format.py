"""Format Tina replies for WhatsApp."""

from __future__ import annotations

import re

_EMPTY_SOURCE = re.compile(
    r"^(Source|Källa):\s*(none found\.?|ingen träff\.?)\s*$",
    re.IGNORECASE,
)
_SOURCE_LINE = re.compile(r"^(\s*)(Source|Källa):\s*(.+)\s*$", re.IGNORECASE)


def strip_empty_source_line(text: str) -> str:
    """Remove 'Source: none found' style lines from a reply."""
    kept: list[str] = []
    for line in text.splitlines():
        if _EMPTY_SOURCE.match(line.strip()):
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def italicize_source_line(text: str) -> str:
    """Wrap real source citations in WhatsApp italics (_text_)."""
    lines: list[str] = []
    for line in text.splitlines():
        match = _SOURCE_LINE.match(line)
        if not match:
            lines.append(line)
            continue
        indent, label, body = match.groups()
        if _EMPTY_SOURCE.match(f"{label}: {body}"):
            continue
        if body.startswith("_") and body.endswith("_"):
            lines.append(line)
            continue
        lines.append(f"{indent}_{label}: {body}_")
    return "\n".join(lines).strip()


def format_whatsapp_reply(text: str, *, has_evidence: bool) -> str:
    cleaned = strip_empty_source_line(text)
    if has_evidence:
        return italicize_source_line(cleaned)
    return cleaned
