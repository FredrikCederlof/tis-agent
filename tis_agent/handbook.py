from __future__ import annotations

import re
from dataclasses import dataclass

from pypdf import PdfReader


@dataclass(frozen=True)
class PageText:
    page_number: int  # 1-based
    text: str


@dataclass(frozen=True)
class Chunk:
    content: str
    section_title: str | None
    page_start: int
    page_end: int
    chunk_index: int


HEADING_RE = re.compile(r"^(?:[A-Z][A-Z0-9 /&'\-]{3,}|[0-9]+\.\s+\S.+)$")


def extract_pages(pdf_path) -> list[PageText]:
    reader = PdfReader(str(pdf_path))
    pages: list[PageText] = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if text:
            pages.append(PageText(page_number=i, text=text))
    return pages


def _guess_section(text: str) -> str | None:
    for line in text.splitlines()[:6]:
        candidate = line.strip()
        if 4 <= len(candidate) <= 80 and HEADING_RE.match(candidate):
            return candidate
    return None


def chunk_pages(
    pages: list[PageText],
    *,
    target_chars: int = 1400,
    overlap_chars: int = 200,
) -> list[Chunk]:
    """Split handbook text into retrieval-sized chunks with page provenance."""
    chunks: list[Chunk] = []
    buffer = ""
    page_start = pages[0].page_number if pages else 1
    page_end = page_start
    section: str | None = None

    def flush() -> None:
        nonlocal buffer, page_start, page_end, section
        content = buffer.strip()
        if not content:
            return
        chunks.append(
            Chunk(
                content=content,
                section_title=section or _guess_section(content),
                page_start=page_start,
                page_end=page_end,
                chunk_index=len(chunks),
            )
        )
        if overlap_chars > 0 and len(content) > overlap_chars:
            buffer = content[-overlap_chars:]
            page_start = page_end
        else:
            buffer = ""
            page_start = page_end
        section = None

    for page in pages:
        page_end = page.page_number
        if not section:
            section = _guess_section(page.text)
        piece = page.text.strip()
        if not piece:
            continue
        if buffer:
            buffer = f"{buffer}\n\n{piece}"
        else:
            buffer = piece
            page_start = page.page_number
        while len(buffer) >= target_chars:
            # Prefer a paragraph boundary near the target size.
            cut = buffer.rfind("\n\n", 0, target_chars)
            if cut < target_chars // 2:
                cut = target_chars
            content = buffer[:cut].strip()
            rest = buffer[cut:].strip()
            if content:
                chunks.append(
                    Chunk(
                        content=content,
                        section_title=section or _guess_section(content),
                        page_start=page_start,
                        page_end=page_end,
                        chunk_index=len(chunks),
                    )
                )
            if overlap_chars > 0 and len(content) > overlap_chars:
                buffer = (content[-overlap_chars:] + "\n\n" + rest).strip()
            else:
                buffer = rest
            page_start = page_end
            section = _guess_section(buffer) if buffer else None

    flush()
    return chunks
