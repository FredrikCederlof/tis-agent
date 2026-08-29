"""Format Tina replies for WhatsApp (not Markdown)."""

from __future__ import annotations

import re

# WhatsApp only formats when markers touch the text: *bold* and _italic_.
# Markdown **bold**, _ spaced italic _, and "* " list bullets leak as literals.

_ZERO_WIDTH = re.compile(r"[\u200b\u200c\u200d\u2060\ufeff]")
_MARKDOWN_HEADING = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_STAR_BULLET = re.compile(r"^(\s*)\*\s+", re.MULTILINE)
_BOLD_TRIPLE = re.compile(r"\*{3}([^*\n]+)\*{3}")
_BOLD_DOUBLE = re.compile(r"\*{2}([^*\n]+)\*{2}")
_BOLD_UNDERSCORE = re.compile(r"_{2}([^_\n]+)_{2}")
_LEFTOVER_BOLD = re.compile(r"\*{2,}([^*\n]+?)\*+([:!?.,;]?)(?:\*+)?")
_WRAPPED_LINE = re.compile(r"^[_*]\s*(.*?)\s*[_*]$")
_SOURCE_CORE = re.compile(r"^(Source|Källa)\s*:\s*(.*)$", re.IGNORECASE)
_EMPTY_SOURCE_BODY = re.compile(
    r"^(none found\.?|ingen träff\.?)\s*$",
    re.IGNORECASE,
)


def _canonical_source_label(raw: str) -> str:
    if raw.casefold() == "källa":
        return "Källa"
    return "Source"


def _line_indent(line: str) -> str:
    return line[: len(line) - len(line.lstrip())]


def _unwrap_line_markers(text: str) -> str:
    """Strip balanced _/ * wrappers, including `_ text _` (spaces inside)."""
    current = text.strip()
    while True:
        match = _WRAPPED_LINE.match(current)
        if not match:
            return current
        inner = match.group(1).strip()
        if inner == current:
            return current
        current = inner


def _parse_source_line(line: str) -> tuple[str, str, str] | None:
    """Return (indent, canonical label, body) when the line is a citation."""
    unwrapped = _unwrap_line_markers(line)
    match = _SOURCE_CORE.match(unwrapped)
    if not match:
        return None
    label = _canonical_source_label(match.group(1))
    body = match.group(2).strip().strip("_*").strip()
    return _line_indent(line), label, body


def strip_zero_width(text: str) -> str:
    return _ZERO_WIDTH.sub("", text)


def strip_markdown_headings(text: str) -> str:
    return _MARKDOWN_HEADING.sub("", text)


def rewrite_star_bullets(text: str) -> str:
    """Turn Markdown/WhatsApp-ambiguous '* item' lists into '- item'."""
    return _STAR_BULLET.sub(r"\1- ", text)


def convert_markdown_bold(text: str) -> str:
    """Rewrite **bold** / __bold__ / ***bold*** to WhatsApp *bold*."""
    text = _BOLD_TRIPLE.sub(r"*\1*", text)
    text = _BOLD_DOUBLE.sub(r"*\1*", text)
    text = _BOLD_UNDERSCORE.sub(r"*\1*", text)
    return text


def collapse_extra_asterisks(text: str) -> str:
    """Fix leftover * around a span, e.g. ***31 August*:** → *31 August:*."""

    def _replace(match: re.Match[str]) -> str:
        inner = match.group(1).strip()
        punct = match.group(2) or ""
        return f"*{inner}{punct}*"

    text = _LEFTOVER_BOLD.sub(_replace, text)
    return text.replace("**", "")


def strip_empty_source_line(text: str) -> str:
    """Remove 'Source: none found' style lines from a reply."""
    kept: list[str] = []
    for line in text.splitlines():
        parsed = _parse_source_line(line)
        if parsed is not None:
            _indent, _label, body = parsed
            if not body or _EMPTY_SOURCE_BODY.match(body):
                continue
        kept.append(line)
    return "\n".join(kept).strip()


def italicize_source_line(text: str) -> str:
    """Wrap real source citations in WhatsApp italics (_text_, no inner spaces)."""
    lines: list[str] = []
    for line in text.splitlines():
        parsed = _parse_source_line(line)
        if not parsed:
            lines.append(line)
            continue
        indent, label, body = parsed
        if _EMPTY_SOURCE_BODY.match(body) or not body:
            continue
        lines.append(f"{indent}_{label}: {body}_")
    return "\n".join(lines).strip()


def format_whatsapp_reply(text: str, *, has_evidence: bool) -> str:
    cleaned = strip_zero_width(text)
    cleaned = strip_markdown_headings(cleaned)
    cleaned = rewrite_star_bullets(cleaned)
    cleaned = convert_markdown_bold(cleaned)
    cleaned = collapse_extra_asterisks(cleaned)
    cleaned = strip_empty_source_line(cleaned)
    if has_evidence:
        return italicize_source_line(cleaned)
    return cleaned
