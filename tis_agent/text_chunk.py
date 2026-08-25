from __future__ import annotations

import re

from tis_agent.handbook import Chunk, _guess_section


def chunk_plain_text(text: str, *, target_chars: int = 1400, overlap_chars: int = 200) -> list[Chunk]:
    """Split plain text (e.g. exported Google Doc) into retrieval chunks."""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []

    chunks: list[Chunk] = []
    buffer = ""
    section: str | None = _guess_section(text)

    while len(text) > 0 or buffer:
        if len(buffer) < target_chars and text:
            take = min(len(text), target_chars - len(buffer))
            if buffer and take:
                buffer = f"{buffer}\n\n{text[:take]}"
            elif take:
                buffer = text[:take]
            else:
                buffer = buffer + text[:take]
            text = text[take:]

        if len(buffer) < target_chars and text:
            continue

        cut = buffer.rfind("\n\n", 0, target_chars)
        if cut < target_chars // 2:
            cut = min(len(buffer), target_chars)
        content = buffer[:cut].strip()
        rest = buffer[cut:].strip()
        if content:
            chunks.append(
                Chunk(
                    content=content,
                    section_title=section or _guess_section(content),
                    page_start=1,
                    page_end=1,
                    chunk_index=len(chunks),
                )
            )
        if overlap_chars > 0 and len(content) > overlap_chars:
            buffer = (content[-overlap_chars:] + "\n\n" + rest).strip()
        else:
            buffer = rest
        section = _guess_section(buffer) if buffer else None

        if not text and len(buffer) < target_chars:
            if buffer.strip():
                chunks.append(
                    Chunk(
                        content=buffer.strip(),
                        section_title=section or _guess_section(buffer),
                        page_start=1,
                        page_end=1,
                        chunk_index=len(chunks),
                    )
                )
            break

    return chunks
