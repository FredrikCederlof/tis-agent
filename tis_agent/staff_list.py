"""Staff-directory lookup for Tina.

Staff List School is a parent document. Role and contact questions read it
directly and keep only the matching rows, so an annual report does not answer
who teaches a subject.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

STAFF_LIST_TITLE = "Staff List School"
STAFF_LIST_SIMILARITY = 0.9

STAFF_ANSWER_RULE = (
    "This is a staff-directory question. Answer the name, role, and email "
    "only from the Staff List School excerpt. Do not use an annual report "
    "or any other document for who holds a role. "
    "Lower School is PYP. Upper School grades 6–10 are MYP. Grades 11–12 are DP. "
    "If the excerpt says no directory row matched, say the staff list does not name that role."
)

_PTC_RE = re.compile(r"(?i)\bparent[- ]teacher\b")
_GENERIC_SCHOOL_CONTACT_RE = re.compile(
    r"(?i)\b(?:"
    r"how (?:do i|to) contact (?:the school|tis)|"
    r"phone number (?:for|to|of) (?:the )?(?:school|tis)|"
    r"contact (?:the )?(?:school|tis)|"
    r"(?:school|tis) (?:phone|switchboard|contacts?)"
    r")\b"
)
_STAFF_LOOKUP_RE = re.compile(
    r"(?i)(?:"
    r"\bwho(?:'s| is| teaches)\b|"
    r"\bname of\b|"
    r"\bcontacts?\s+(?:to|for)\b|"
    r"\b(?:e-?mail|phone|extension)\s+(?:for|of|address)\b|"
    r"\b(?:phe|physical education)\b|"
    r"\b(?:myp|middle years?)\b.{0,48}\bteacher\b|"
    r"\bteacher\b.{0,48}\b(?:myp|pyp|dp|middle years?)\b"
    r")"
)
_MYP_RE = re.compile(r"(?i)\b(?:myp|middle\s+years?|middle\s+school)\b")
_PYP_RE = re.compile(r"(?i)\b(?:pyp|lower\s+school|early\s+years|kindergarten)\b")
_DP_RE = re.compile(r"(?i)\b(?:\bdp\b|diploma)\b")
_PHE_RE = re.compile(r"(?i)\b(?:phe|physical\s+education)\b")
_EMAIL_RE = re.compile(
    r"[A-Za-z0-9._+-]+@tokyois\.com(?:\s*;\s*[A-Za-z0-9._+-]+@tokyois\.com)*",
    re.IGNORECASE,
)
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’-]{2,}")

_STOPWORDS = frozenset(
    {
        "what",
        "whats",
        "what's",
        "who",
        "whos",
        "who's",
        "the",
        "name",
        "for",
        "and",
        "with",
        "from",
        "that",
        "this",
        "teacher",
        "teachers",
        "program",
        "programme",
        "middle",
        "years",
        "year",
        "school",
        "contact",
        "contacts",
        "email",
        "phone",
        "please",
        "can",
        "you",
        "your",
        "our",
        "their",
        "about",
        "does",
        "have",
        "list",
        "staff",
    }
)

_SUBJECT_RE = re.compile(
    r"(?i)\b(?:phe|physical education|english|maths?|science|music|japanese|"
    r"art|arts|design|humanities|tok|nurse|admissions|librarian|counsel)"
)


@dataclass(frozen=True)
class StaffRecord:
    department: str
    name: str
    title: str
    email: str

    def programme(self) -> str | None:
        blob = f"{self.department} {self.title}"
        if re.search(r"(?i)\b(?:lower school|\bls\b|kindergarten)\b", blob):
            return "pyp"
        if re.search(r"(?i)\b(?:grade\s*[1-5]|\bg[1-5][a-z]?\b)\b", blob):
            return "pyp"
        if re.search(r"(?i)\b(?:g1[12][a-z]?|grade\s*1[12]|diploma|\bdp\b)\b", blob):
            return "dp"
        if re.search(
            r"(?i)\b(?:upper school|\bus\b|g(?:6|7|8|9|10)[a-z]?|grade\s*(?:6|7|8|9|10)|myp)\b",
            blob,
        ):
            return "myp"
        return None


def is_staff_lookup_question(question: str) -> bool:
    """True when the parent is asking who holds a role, or for their contact."""
    text = question or ""
    if _PTC_RE.search(text) or _GENERIC_SCHOOL_CONTACT_RE.search(text):
        return False
    return bool(_STAFF_LOOKUP_RE.search(text))


def parse_staff_records(text: str) -> list[StaffRecord]:
    """Pull one record per email out of the character-chunked staff CSV."""
    flat = re.sub(r"\s+", " ", text or "")
    by_email: dict[str, StaffRecord] = {}
    for match in _EMAIL_RE.finditer(flat):
        email = re.sub(r"\s+", "", match.group(0))
        before = flat[: match.start()].rstrip(" ,")
        parts = [part.strip() for part in before.split(",")]
        if len(parts) < 3:
            continue
        title, name, department = parts[-1], parts[-2], parts[-3]
        department = re.sub(r"^.*\.pdf\s*,\s*\d+\s+", "", department).strip()
        department = re.sub(
            r"^(?:(?:Email|Source Page|Phone / Extension|Notes|Source PDF)\s+)+",
            "",
            department,
        )
        department = re.sub(r"^\d+\s+", "", department).strip(" -")
        if not _plausible_name(name) or "@" in title:
            continue
        record = StaffRecord(department, name, title, email)
        key = email.lower()
        current = by_email.get(key)
        if current is None or len(record.department) > len(current.department):
            by_email[key] = record
    return list(by_email.values())


def select_staff_records(records: list[StaffRecord], question: str) -> tuple[list[StaffRecord], bool]:
    """Return matching rows, and whether the question was too broad to list."""
    if not records:
        return [], False

    name_hits = [row for row in records if _name_match(row, question)]
    if name_hits:
        pool = name_hits
    else:
        subject_hits = [row for row in records if _subject_match(row, question)]
        if subject_hits:
            pool = subject_hits
        else:
            pool = [row for row in records if _title_word_match(row, question)]

    programme = _asked_programme(question)
    if programme:
        narrowed = [row for row in pool if row.programme() == programme]
        if narrowed:
            pool = narrowed

    if not pool:
        return [], False
    if len(pool) > 8:
        return [], True
    return pool, False


def format_staff_excerpt(records: list[StaffRecord], *, too_broad: bool) -> str:
    lines = [
        "Staff List School",
        "Directory columns: Department, Name, Title, Email.",
        "Lower School is PYP. Upper School grades 6-10 are MYP. Grades 11-12 are DP.",
    ]
    if too_broad:
        lines.append(
            "No single directory row matched. The question fits many staff. "
            "Ask for a name or a specific role."
        )
        return "\n".join(lines)
    if not records:
        lines.append(
            "No directory row matched this question. "
            "Do not substitute an annual report."
        )
        return "\n".join(lines)
    for row in records:
        lines.append(f"{row.department} | {row.name} | {row.title} | {row.email}")
    return "\n".join(lines)


def _plausible_name(name: str) -> bool:
    if not name or len(name) > 60 or "@" in name or any(ch.isdigit() for ch in name):
        return False
    return bool(re.match(r"^[A-Z][A-Za-z .'-]+$", name))


def _asked_programme(question: str) -> str | None:
    if _MYP_RE.search(question or ""):
        return "myp"
    if _PYP_RE.search(question or ""):
        return "pyp"
    if _DP_RE.search(question or ""):
        return "dp"
    return None


def _subject_match(row: StaffRecord, question: str) -> bool:
    if _PHE_RE.search(question or ""):
        return bool(_PHE_RE.search(row.title))
    match = _SUBJECT_RE.search(question or "")
    if not match:
        return False
    word = match.group(0).lower()
    if word == "physical education":
        word = "phe"
    return word in row.title.lower()


def _name_match(row: StaffRecord, question: str) -> bool:
    tokens = _query_tokens(question)
    if not tokens:
        return False
    name_parts = [part.lower() for part in re.split(r"\s+", row.name) if part]
    for token in tokens:
        for part in name_parts:
            if token == part:
                return True
            if len(token) >= 6 and len(part) >= 6 and token[:6] == part[:6]:
                return True
    return False


def _title_word_match(row: StaffRecord, question: str) -> bool:
    blob = f"{row.department} {row.title}".lower()
    return any(token in blob for token in _query_tokens(question) if len(token) >= 4)


def _query_tokens(question: str) -> list[str]:
    tokens: list[str] = []
    for match in _WORD_RE.finditer(question or ""):
        word = match.group(0).lower().replace("’", "'")
        if word in _STOPWORDS or _SUBJECT_RE.fullmatch(word):
            continue
        tokens.append(word)
    return tokens
