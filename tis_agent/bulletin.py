"""Sanitize school-mail dumps into a whole-school weekly bulletin.

Tina's knowledge base is shared across all TIS parents. Family inboxes mix
whole-school notices with Kindergarten / Grade 3 / Grade 6 items and the same
Toddle send repeated once per child. This module keeps PYP / MYP / DP /
whole-school notices, drops grade-only and marketing noise, strips child names,
and dedupes repeated announcements.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from email.utils import parseaddr
from pathlib import Path

from tis_agent.temporal import tokyo_today

MESSAGE_SEPARATOR = "=== MESSAGE ==="

# Never persist these in the shared knowledge base (family inbox leakage).
_CHILD_NAME_RE = re.compile(
    r"\b(?:Vega[\s\-]+Lo|Eldor|Malte|Vega)'?s?\b",
    re.IGNORECASE,
)

_PERSONAL_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "icloud.com",
        "me.com",
        "mac.com",
        "outlook.com",
        "hotmail.com",
        "live.com",
        "yahoo.com",
    }
)

_SCHOOL_SENDER_HINTS = (
    "tokyois.com",
    "openapply.com",
    "toddleapp.com",
    "toddle",
    "managebac.com",
    "managebac",
    "schoolsbuddy",
    "seesaw",
)

_FOLDER_FROM_HINTS = (
    "drive-noreply",
    "comments-noreply",
    "docs.google.com",
    "drive.google.com",
    "noreply@google.com",
)

_FOLDER_SUBJECT_RE = re.compile(
    r"\b(folder|shared with you|added items|changed a file|commented on|"
    r"moved a file|ownership of)\b",
    re.IGNORECASE,
)

_MARKETING_SUBJECT_RE = re.compile(
    r"\b(unsubscribe|webinar|free trial|upgrade your|pricing|what.?s new in|"
    r"product (?:update|launch)|limited time|shop now|sale)\b",
    re.IGNORECASE,
)

_FOOTER_RE = re.compile(
    r"unsubscribe|view (?:this )?email in (?:your )?browser|"
    r"this email was sent to|you(?:.re| are) receiving this email|"
    r"sent (?:via|from) toddle|managebac\.com|copyright\s+\d{4}|"
    r"all rights reserved|privacy policy",
    re.IGNORECASE,
)

_WHOLE_SCHOOL_RE = re.compile(
    r"\b(whole school|all parents|all students|all families|all grades|"
    r"school community|tis community|entire school|community handbook|"
    r"all pyp|all myp|all dp)\b",
    re.IGNORECASE,
)
_PYP_RE = re.compile(r"\b(pyp|primary years)\b", re.IGNORECASE)
_MYP_RE = re.compile(r"\b(myp|middle years)\b", re.IGNORECASE)
_DP_RE = re.compile(
    r"\b(?:ib diploma|diploma programme|diploma program|dp)\b",
    re.IGNORECASE,
)
_KINDER_RE = re.compile(
    r"\b(kindergarten|kindy|kinder|pre-k|early years|\belc\b)\b",
    re.IGNORECASE,
)
_GRADE3_RE = re.compile(
    r"\b(?:grade\s*3|year\s*3|\bg3\b|3rd grade|class\s*3)\b",
    re.IGNORECASE,
)
_GRADE6_RE = re.compile(
    r"\b(?:grade\s*6|year\s*6|\bg6\b|6th grade|class\s*6)\b",
    re.IGNORECASE,
)
_OTHER_GRADE_RE = re.compile(
    r"\b(?:grade|year)\s*(?:1|2|4|5|7|8|9|10|11|12)\b",
    re.IGNORECASE,
)

_HEADING_RE = re.compile(r"^(?:#{1,3}\s+).+|^[A-Z][A-Z0-9 /,&'\-]{8,}$")


@dataclass(frozen=True)
class RawMessage:
    sender: str
    date: str
    subject: str
    body: str


@dataclass(frozen=True)
class BulletinBlock:
    subject: str
    sender: str
    date: str
    body: str
    reason: str = "kept"


@dataclass
class SanitizeResult:
    title: str
    markdown: str
    threads_opened: int
    blocks_kept: int
    blocks_dropped: int
    dropped_reasons: dict[str, int] = field(default_factory=dict)
    child_names_present: bool = False

    @property
    def status_if_empty(self) -> str:
        return "" if not self.markdown.strip() or self.child_names_present else "ready"


def bulletin_title(as_of: date | None = None) -> str:
    day = as_of or tokyo_today()
    return f"TIS Weekly Bulletin {day.isoformat()}"


def child_names_in(text: str) -> bool:
    return bool(_CHILD_NAME_RE.search(text or ""))


def strip_child_names(text: str) -> str:
    cleaned = _CHILD_NAME_RE.sub("", text or "")
    cleaned = re.sub(r"\bparents of\s+(?=[,.;]|$)", "parents", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bparent of\s+(?=[,.;]|$)", "parent", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+'s\b", "", cleaned)
    cleaned = re.sub(r"\(\s*\)", "", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def parse_raw_dump(text: str) -> list[RawMessage]:
    chunks = re.split(rf"^{re.escape(MESSAGE_SEPARATOR)}\s*$", text, flags=re.MULTILINE)
    messages: list[RawMessage] = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        headers, _, body = chunk.partition("\n\n")
        fields: dict[str, str] = {"from": "", "date": "", "subject": ""}
        header_lines = headers.splitlines()
        body_start_lines: list[str] = []
        in_headers = True
        for line in header_lines:
            if in_headers:
                match = re.match(r"^(From|Date|Subject)\s*:\s*(.*)$", line, re.IGNORECASE)
                if match:
                    fields[match.group(1).lower()] = match.group(2).strip()
                    continue
                if fields["from"] or fields["subject"] or fields["date"]:
                    in_headers = False
                    body_start_lines.append(line)
            else:
                body_start_lines.append(line)
        body_text = "\n".join(body_start_lines)
        if body_text and body:
            body = f"{body_text}\n\n{body}"
        elif body_text:
            body = body_text
        messages.append(
            RawMessage(
                sender=fields["from"],
                date=fields["date"],
                subject=fields["subject"],
                body=body.strip(),
            )
        )
    return messages


def _sender_email(sender: str) -> str:
    _name, addr = parseaddr(sender or "")
    return (addr or sender or "").strip().lower()


def _sender_domain(sender: str) -> str:
    email = _sender_email(sender)
    if "@" not in email:
        return ""
    return email.rsplit("@", 1)[-1]


def _looks_like_school_sender(sender: str) -> bool:
    blob = (sender or "").lower()
    return any(hint in blob for hint in _SCHOOL_SENDER_HINTS)


def _is_personal_thread(message: RawMessage) -> bool:
    domain = _sender_domain(message.sender)
    if domain in _PERSONAL_DOMAINS and not _looks_like_school_sender(message.sender):
        return True
    return False


def _is_folder_noise(message: RawMessage) -> bool:
    sender = (message.sender or "").lower()
    if any(hint in sender for hint in _FOLDER_FROM_HINTS):
        return True
    if _FOLDER_SUBJECT_RE.search(message.subject or "") and not _looks_like_school_sender(
        message.sender
    ):
        return True
    return False


def _is_marketing(message: RawMessage) -> bool:
    if _looks_like_school_sender(message.sender) and "tokyois.com" in (message.sender or "").lower():
        return False
    blob = f"{message.subject}\n{message.body}"
    if _MARKETING_SUBJECT_RE.search(message.subject or ""):
        return True
    if re.search(r"\bunsubscribe\b", blob, re.IGNORECASE) and not re.search(
        r"\b(absence|uniform|calendar|handbook|pyp|myp|dp|toddle|managebac)\b",
        blob,
        re.IGNORECASE,
    ):
        return True
    return False


def _looks_like_heading(text: str) -> bool:
    stripped = text.strip()
    if "\n" in stripped:
        return False
    if len(stripped) > 80:
        return False
    return bool(_HEADING_RE.match(stripped)) or stripped.endswith(":")


def split_blocks(body: str) -> list[str]:
    text = (body or "").strip()
    if not text:
        return []
    parts = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    if len(parts) <= 1:
        return parts or [text]
    blocks: list[str] = []
    pending: str | None = None
    for part in parts:
        if _looks_like_heading(part) and pending is None:
            pending = part
            continue
        if pending:
            blocks.append(f"{pending}\n\n{part}")
            pending = None
        else:
            blocks.append(part)
    if pending:
        blocks.append(pending)
    return blocks


def _is_footer_block(text: str) -> bool:
    stripped = text.strip()
    if len(stripped) < 40 and _FOOTER_RE.search(stripped):
        return True
    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    if lines and all(_FOOTER_RE.search(line) or len(line) < 12 for line in lines):
        return True
    return False


def _is_grade_only(text: str) -> bool:
    """Drop Kindergarten-only, Grade 3-only, and Grade 6-only items."""
    has_k = bool(_KINDER_RE.search(text))
    has_g3 = bool(_GRADE3_RE.search(text))
    has_g6 = bool(_GRADE6_RE.search(text))
    if not (has_k or has_g3 or has_g6):
        return False
    if _WHOLE_SCHOOL_RE.search(text) or _OTHER_GRADE_RE.search(text) or _DP_RE.search(text):
        return False
    has_pyp = bool(_PYP_RE.search(text))
    has_myp = bool(_MYP_RE.search(text))
    # PYP Grade 3 field trip is still Grade 3-only. Bare PYP is kept.
    if has_pyp and not has_g3 and not has_k:
        return False
    if has_myp and not has_g6:
        return False
    if has_pyp and has_g3 and not has_k and not has_g6:
        return True
    if has_myp and has_g6 and not has_k and not has_g3:
        return True
    return True


def _dedupe_key(subject: str, body: str) -> str:
    blob = strip_child_names(f"{subject}\n{body}").lower()
    blob = re.sub(r"\b(?:dear|hi|hello)\s+parents?(?:\s+of)?\b", " ", blob)
    blob = re.sub(r"[^a-z0-9]+", " ", blob)
    return re.sub(r"\s+", " ", blob).strip()


def classify_message(message: RawMessage) -> str | None:
    """Return a drop reason for the whole message, or None to inspect blocks."""
    if _is_personal_thread(message):
        return "personal"
    if _is_folder_noise(message):
        return "folder_noise"
    if _is_marketing(message):
        return "marketing"
    if not (message.subject or "").strip() and not (message.body or "").strip():
        return "empty"
    return None


def sanitize_dump(text: str, *, as_of: date | None = None) -> SanitizeResult:
    title = bulletin_title(as_of)
    messages = parse_raw_dump(text)
    dropped: dict[str, int] = {}
    kept: list[BulletinBlock] = []
    seen: set[str] = set()

    def bump(reason: str) -> None:
        dropped[reason] = dropped.get(reason, 0) + 1

    for message in messages:
        whole_reason = classify_message(message)
        if whole_reason:
            bump(whole_reason)
            continue
        blocks = split_blocks(message.body) or [message.body.strip() or message.subject]
        for raw_block in blocks:
            block_text = strip_child_names(raw_block)
            subject = strip_child_names(message.subject)
            if not block_text:
                bump("empty")
                continue
            if _is_footer_block(block_text):
                bump("footer")
                continue
            if len(block_text) < 40 and not _PYP_RE.search(block_text) and not _MYP_RE.search(
                block_text
            ):
                bump("too_short")
                continue
            scoped = f"{subject}\n{block_text}"
            if _is_grade_only(scoped):
                bump("grade_only")
                continue
            key = _dedupe_key(subject, block_text)
            if not key:
                bump("empty")
                continue
            if key in seen:
                bump("duplicate")
                continue
            seen.add(key)
            kept.append(
                BulletinBlock(
                    subject=subject,
                    sender=message.sender,
                    date=message.date,
                    body=block_text,
                )
            )

    markdown = render_bulletin(title, kept)
    names_present = child_names_in(markdown)
    if names_present:
        markdown = ""
    elif not kept:
        markdown = ""

    return SanitizeResult(
        title=title,
        markdown=markdown,
        threads_opened=len(messages),
        blocks_kept=len(kept) if not names_present else 0,
        blocks_dropped=sum(dropped.values()) + (len(kept) if names_present else 0),
        dropped_reasons=dropped,
        child_names_present=names_present,
    )


def render_bulletin(title: str, blocks: list[BulletinBlock]) -> str:
    if not blocks:
        return ""
    parts = [f"# {title}", ""]
    parts.append(
        "Sanitized whole-school notices from official TIS school mail "
        "(PYP / MYP / DP / community). Grade-only items are omitted."
    )
    parts.append("")
    for block in blocks:
        heading = block.subject.strip() or "School notice"
        parts.append(f"## {heading}")
        parts.append("")
        meta = [item for item in (block.sender, block.date) if item]
        if meta:
            parts.append(" · ".join(meta))
            parts.append("")
        parts.append(block.body.strip())
        parts.append("")
    text = "\n".join(parts).strip() + "\n"
    return strip_child_names(text)


def sanitize_path(path: Path, *, as_of: date | None = None) -> SanitizeResult:
    return sanitize_dump(path.read_text(encoding="utf-8"), as_of=as_of)


def result_to_summary(
    result: SanitizeResult,
    *,
    status: str,
    chunks: int = 0,
    document_id: str | None = None,
    dry_run: bool = False,
) -> dict:
    return {
        "status": status,
        "title": result.title,
        "source_type": "bulletin",
        "threads_opened": result.threads_opened,
        "blocks_kept": result.blocks_kept,
        "blocks_dropped": result.blocks_dropped,
        "dropped_reasons": result.dropped_reasons,
        "child_names_present": result.child_names_present,
        "chunks": chunks,
        "document_id": document_id,
        "dry_run": dry_run,
    }


def ingest_sanitized_bulletin(
    settings,
    result: SanitizeResult,
    *,
    sanitized_path: Path | None = None,
) -> dict:
    """Upload and vectorize a sanitized bulletin. Does not ingest empty/unsafe text."""
    from tis_agent.clients import make_supabase
    from tis_agent.ingest_document import ingest_bytes
    from tis_agent.storage import upload_bytes

    if result.child_names_present or not result.markdown.strip():
        return result_to_summary(result, status="")

    data = result.markdown.encode("utf-8")
    day_stamp = result.title.rsplit(" ", 1)[-1]
    storage_path = f"sources/bulletins/tis-weekly-bulletin-{day_stamp}.md"
    source_key = f"bulletin:weekly:{day_stamp}"
    modified_iso = datetime.now(timezone.utc).isoformat()
    supabase = make_supabase(settings)
    upload_bytes(supabase, storage_path, data, content_type="text/markdown")
    ingested = ingest_bytes(
        settings,
        data=data,
        title=result.title,
        mime_type="text/markdown",
        storage_path=storage_path,
        drive_file_id=source_key,
        drive_modified_time=modified_iso,
        source_type="bulletin",
    )
    if sanitized_path:
        sanitized_path.parent.mkdir(parents=True, exist_ok=True)
        sanitized_path.write_text(result.markdown, encoding="utf-8")
    status = "skipped" if ingested.skipped else "synced"
    return result_to_summary(
        result,
        status=status,
        chunks=ingested.chunks,
        document_id=ingested.document_id,
    )


def sync_bulletin_path(
    path: Path,
    *,
    settings=None,
    dry_run: bool = False,
    as_of: date | None = None,
    sanitized_out: Path | None = None,
) -> dict:
    result = sanitize_path(path, as_of=as_of)
    if sanitized_out is not None:
        sanitized_out.parent.mkdir(parents=True, exist_ok=True)
        sanitized_out.write_text(result.markdown, encoding="utf-8")
    if dry_run:
        status = "dry-run" if result.markdown.strip() and not result.child_names_present else ""
        return result_to_summary(result, status=status, dry_run=True)
    if settings is None:
        raise ValueError("settings are required unless --dry-run")
    return ingest_sanitized_bulletin(settings, result, sanitized_path=None)
