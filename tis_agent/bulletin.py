"""Sanitize school mail into a weekly bulletin for RAG.

Input is a dump of Toddle / tokyois / school emails. Output is markdown that
keeps school-wide and family-grade (Kindergarten, Grade 3, Grade 6) facts,
strips child names, and drops personal teacher notes about one child.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from tis_agent.html_text import html_to_text


CHILD_NAME_RE = re.compile(
    r"\b(?:Eldor|Malte|Vega(?:[-\s]?Lo)?)\b(?:['’]s)?",
    re.IGNORECASE,
)

MESSAGE_SPLIT_RE = re.compile(
    r"(?:^|\n)(?:===+\s*MESSAGE\s*===+|-{3,})\s*\n",
    re.IGNORECASE,
)

SCHOOL_SENDER_RE = re.compile(
    r"@(?:tokyois\.com|toddleapp\.com|toddle\.in|openapply\.com|"
    r"managebac\.com|schoolsbuddy\.net|seesaw\.me)\b",
    re.IGNORECASE,
)
PERSONAL_SENDER_RE = re.compile(
    r"From:\s*.*@(?:gmail|googlemail|icloud|me|yahoo|hotmail|outlook|live)\.com\b",
    re.IGNORECASE,
)
PERSONAL_EMAIL_RE = re.compile(
    r"\b[\w.+-]+@(?:gmail|googlemail|icloud|me|yahoo|hotmail|outlook|live)\.com\b",
    re.IGNORECASE,
)
NO_REPLY_SENDER_RE = re.compile(r"(?i)\b(?:no-?reply|notices|noreply)@")
CLASS_BLAST_SUBJECT_RE = re.compile(
    r"(?i)^\s*(?:school announcement:|announcement sent in\b)"
)
TEACHER_REPLY_SUBJECT_RE = re.compile(r"(?i)^\s*re\s*:")
ONE_CHILD_INTEREST_RE = re.compile(
    r"(?i)thank you for your interest|submitted information for your child"
)
PASSWORD_URL_RE = re.compile(
    r"https?://\S*(?:password|reset_password_token|token=)\S*",
    re.IGNORECASE,
)

SCHOOL_WIDE_RE = re.compile(
    r"\b(?:whole school|school[- ]wide|all parents|all families|all students|"
    r"entire school|school community|tis families|tis community|every grade|"
    r"all grades|k\s*[-–]\s*12|kg through|community handbook|"
    r"upper school|lower school)\b",
    re.IGNORECASE,
)
ALL_PYP_RE = re.compile(
    r"\b(?:all pyp|pyp[- ]wide|entire pyp|pyp parents|pyp families|"
    r"pyp community)\b",
    re.IGNORECASE,
)
ALL_MYP_RE = re.compile(
    r"\b(?:all myp|myp[- ]wide|entire myp|myp parents|myp families|"
    r"myp community)\b",
    re.IGNORECASE,
)
ALL_DP_RE = re.compile(
    r"\b(?:all dp|dp[- ]wide|entire dp|dp parents|diploma programme|"
    r"diploma program)\b",
    re.IGNORECASE,
)

KINDERGARTEN_RE = re.compile(
    r"\b(?:kindergarten|kindergarden|kindy|early years|"
    r"kg(?:\s*[-–]?\s*[12])?|k(?:g)?\s*[-–]?\s*[12])\b",
    re.IGNORECASE,
)
GRADE_3_RE = re.compile(
    r"\b(?:grades?|year)\s*3\b|\bg3\b|\bpyp\s*3\b|\b3b\b|\b3rd\s+grade\b|\bthird\s+grade\b",
    re.IGNORECASE,
)
GRADE_6_RE = re.compile(
    r"\b(?:grades?|year)\s*6\b|\bg6\b|\bmyp\s*1\b|\bmyp1\b|\b6b\b|"
    r"\b6th\s+grade\b|\bsixth\s+grade\b",
    re.IGNORECASE,
)
HOMEROOM_RE = re.compile(r"\b(?:3B|6B|KA)\b", re.IGNORECASE)
OTHER_GRADE_RE = re.compile(
    r"\b(?:grades?|year|g)\s*(?:1|2|4|5|7|8|9|10|11|12)\b|"
    r"\b(?:g10|g11|g12)\b|"
    r"\b(?:1st|2nd|4th|5th|7th|8th|9th|10th|11th|12th)\s+grade\b",
    re.IGNORECASE,
)
MULTI_GRADE_RE = re.compile(
    r"\b(?:grades?|years?)\s+\d+\s*[-–&,]\s*(?:and\s+)?\d+"
    r"|\b(?:kindergarten|kindergarden|kg)\s+to\s+grade\s+\d+"
    r"|\bgrade\s+\d+\s+to\s+grade\s+\d+",
    re.IGNORECASE,
)
GRADE_NUMBER_LIST_RE = re.compile(
    r"\b(\d{1,2})(?:\s*,\s*(?:and\s+)?(\d{1,2}))+\b"
)

TODDLE_CHROME_RE = re.compile(
    r"(?is)(?:^|\n)\s*(?:Related students?\b|View announcement on Toddle\b|"
    r"Stay connected, informed and involved\b|"
    r"Toddle,\s*East Cheery Lynn Road\b).*$"
)

FROM_LINE_RE = re.compile(r"^From:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
SUBJECT_LINE_RE = re.compile(r"^Subject:\s*(.+)$", re.IGNORECASE | re.MULTILINE)


@dataclass
class BulletinResult:
    markdown: str
    kept_blocks: int
    dropped_blocks: int
    child_mentions_removed: int
    dropped_reasons: list[str] = field(default_factory=list)


def contains_child_names(text: str) -> bool:
    return bool(CHILD_NAME_RE.search(text or ""))


def strip_child_names(text: str) -> tuple[str, int]:
    count = 0

    def _repl(_match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return ""

    cleaned = CHILD_NAME_RE.sub(_repl, text)
    return _tidy_after_redaction(cleaned), count


def sanitize_bulletin(raw: str, *, week_label: str | None = None) -> BulletinResult:
    """Turn a raw school-mail dump into RAG-safe weekly bulletin markdown."""
    text = (raw or "").strip()
    if not text:
        return BulletinResult(markdown="", kept_blocks=0, dropped_blocks=0, child_mentions_removed=0)

    if _looks_like_html(text):
        text = html_to_text(text)

    dropped_reasons: list[str] = []
    kept: list[str] = []
    dropped = 0
    names_removed = 0
    seen_hashes: set[str] = set()

    for message in _split_messages(text):
        if _is_personal_message(message):
            dropped += 1
            dropped_reasons.append("personal_sender")
            continue
        if _is_personal_teacher_to_child(message):
            dropped += 1
            dropped_reasons.append("personal_teacher_to_child")
            continue
        subject = _header_value(SUBJECT_LINE_RE, message)
        body = _strip_toddle_chrome(_strip_headers(message))
        if _is_irrelevant_grade_only(f"{subject or ''}\n{body}"):
            dropped += 1
            dropped_reasons.append("irrelevant_grade_only")
            continue
        for block in _split_blocks(body, subject=subject):
            cleaned, n = strip_child_names(block)
            names_removed += n
            if contains_child_names(cleaned):
                dropped += 1
                dropped_reasons.append("child_name_remaining")
                continue
            if not cleaned:
                dropped += 1
                dropped_reasons.append("empty_after_name_strip")
                continue
            digest = _block_hash(cleaned)
            if digest in seen_hashes:
                dropped += 1
                dropped_reasons.append("duplicate")
                continue
            seen_hashes.add(digest)
            kept.append(cleaned)

    if not kept:
        return BulletinResult(
            markdown="",
            kept_blocks=0,
            dropped_blocks=dropped,
            child_mentions_removed=names_removed,
            dropped_reasons=dropped_reasons,
        )

    header = "TIS Weekly Bulletin"
    if week_label:
        header = f"{header} ({week_label})"
    body = "\n\n".join(kept)
    markdown = (
        f"# {header}\n\n"
        "Official TIS / Toddle / portal parent notices. Child names are removed. "
        "Personal teacher notes about one child are omitted. Kindergarten, Grade 3, "
        "and Grade 6 class notices are kept.\n\n"
        f"{body}\n"
    )
    if contains_child_names(markdown):
        raise ValueError("Sanitized bulletin still contains a child name; refusing to emit.")
    return BulletinResult(
        markdown=markdown,
        kept_blocks=len(kept),
        dropped_blocks=dropped,
        child_mentions_removed=names_removed,
        dropped_reasons=dropped_reasons,
    )


def _looks_like_html(text: str) -> bool:
    sample = text[:2000].lower()
    return "<html" in sample or "<div" in sample or "<p " in sample or "<table" in sample


def _split_messages(text: str) -> list[str]:
    parts = [p.strip() for p in MESSAGE_SPLIT_RE.split(text) if p.strip()]
    return parts or [text.strip()]


def _split_blocks(body: str, *, subject: str | None) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", body) if p.strip()]
    if subject and paragraphs:
        first = paragraphs[0]
        if subject.lower() not in first.lower():
            paragraphs[0] = f"{subject}\n{first}"
    return paragraphs or ([body.strip()] if body.strip() else [])


def _strip_toddle_chrome(text: str) -> str:
    """Drop Toddle related-student footers so Grade 3/6 labels do not sink school-wide mail."""
    return TODDLE_CHROME_RE.sub("", text).strip()


def _strip_headers(message: str) -> str:
    lines = []
    for line in message.splitlines():
        if re.match(r"^(From|Date|Subject|Source|To|Cc):\s*", line, re.IGNORECASE):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _header_value(pattern: re.Pattern[str], message: str) -> str | None:
    match = pattern.search(message)
    if not match:
        return None
    value = match.group(1).strip()
    return value or None


def _is_personal_message(message: str) -> bool:
    from_match = FROM_LINE_RE.search(message)
    if not from_match:
        return False
    sender = from_match.group(1)
    if SCHOOL_SENDER_RE.search(sender):
        return False
    return bool(PERSONAL_SENDER_RE.search(message)) or bool(
        PERSONAL_EMAIL_RE.search(sender) and not SCHOOL_SENDER_RE.search(sender)
    )


def _is_class_or_community_blast(subject: str | None) -> bool:
    return bool(subject and CLASS_BLAST_SUBJECT_RE.search(subject))


def _is_individual_school_staff(sender: str) -> bool:
    return bool(SCHOOL_SENDER_RE.search(sender) and not NO_REPLY_SENDER_RE.search(sender))


def _is_personal_teacher_to_child(message: str) -> bool:
    """Drop 1:1 teacher/admissions notes about one named child; keep class blasts."""
    subject = _header_value(SUBJECT_LINE_RE, message)
    from_match = FROM_LINE_RE.search(message)
    sender = from_match.group(1) if from_match else ""

    if _is_class_or_community_blast(subject):
        return False

    combined = f"{subject or ''}\n{message}"
    if ONE_CHILD_INTEREST_RE.search(combined) and contains_child_names(combined):
        return True
    if contains_child_names(subject or ""):
        return True

    if not _is_individual_school_staff(sender):
        return False
    if TEACHER_REPLY_SUBJECT_RE.match(subject or "") and contains_child_names(message):
        return True
    if contains_child_names(message) and re.search(
        r"(?i)\b(?:dear|hi|hello)\s+fredrik\b",
        message,
    ):
        return True
    return False


def _mentions_family_grade(text: str) -> bool:
    if KINDERGARTEN_RE.search(text) or GRADE_3_RE.search(text) or GRADE_6_RE.search(text):
        return True
    if HOMEROOM_RE.search(text):
        return True
    for match in GRADE_NUMBER_LIST_RE.finditer(text):
        nums = {int(n) for n in re.findall(r"\d{1,2}", match.group(0))}
        if nums & {3, 6}:
            return True
    return False


def _is_irrelevant_grade_only(text: str) -> bool:
    """True for a single other grade (not K / G3 / G6) with no school-wide language."""
    if MULTI_GRADE_RE.search(text) or SCHOOL_WIDE_RE.search(text):
        return False
    if ALL_DP_RE.search(text) or ALL_MYP_RE.search(text) or ALL_PYP_RE.search(text):
        return False
    if _mentions_family_grade(text):
        return False
    return bool(OTHER_GRADE_RE.search(text))


def _is_grade_band_only(text: str) -> bool:
    """Back-compat alias: family grades are kept, other single grades are dropped."""
    return _is_irrelevant_grade_only(text)


def _block_hash(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _tidy_after_redaction(text: str) -> str:
    text = PERSONAL_EMAIL_RE.sub("[email removed]", text)
    text = PASSWORD_URL_RE.sub("[link removed]", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"\s+,", ",", text)
    text = re.sub(r",\s*,+", ",", text)
    text = re.sub(r"(?i)\bDear\s+and\s+Family\b", "Dear families", text)
    text = re.sub(r"\bDear\s*,", "Dear families", text, flags=re.IGNORECASE)
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip(" \t,;")
