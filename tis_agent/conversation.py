"""WhatsApp/session conversation helpers: greetings and follow-up rewrite."""

from __future__ import annotations

import re
from dataclasses import dataclass

from tis_agent.agent_config import DEFAULT_GREETING_MESSAGE

_GREETING_RE = re.compile(
    r"(?is)^\s*(?:hi|hii+|hello|hey|yo|good\s+(?:morning|afternoon|evening)|"
    r"hej|tjena|hallå|hola|thanks|thank\s+you|thank\s+u|tack|"
    r"ok|okay|okey|cheers|bye|goodbye|"
    r"great|awesome|cool|nice|perfect|got\s+it|sounds?\s+good|"
    r"all\s+good|understood|noted|👍|🙏)"
    r"[\s!.?]*$"
)
_CONFIRM_RE = re.compile(
    r"(?is)^\s*(?:are\s+you\s+sure|are\s+u\s+sure|sure\?|really\?|"
    r"confirm(?:\s+that)?|check\s+(?:again|the\s+calendar|calendar)|"
    r"double[- ]?check|är\s+du\s+säker|kolla\s+(?:igen|kalendern))"
    r"[\s!.?]*$"
)
_PORTAL_NUDGE_RE = re.compile(
    r"(?is)^\s*(?:yes\s+in\s+tis\s+portal|in\s+the\s+(?:tis\s+)?portal|"
    r"check\s+(?:the\s+)?(?:calendar|portal)|look\s+(?:in|at)\s+(?:the\s+)?calendar)"
    r"[\s!.?]*$"
)
_SHORT_DATE_FOLLOWUP_RE = re.compile(
    r"(?is)^\s*(?:what\s+about|and|how\s+about|och|hur\s+är\s+det\s+med)\b"
)


@dataclass(frozen=True)
class ConversationTurn:
    question: str
    reply: str


def is_greeting_or_thanks(text: str) -> bool:
    return bool(_GREETING_RE.match((text or "").strip()))


def is_confirmation_challenge(text: str) -> bool:
    return bool(_CONFIRM_RE.match((text or "").strip()))


def is_calendar_portal_nudge(text: str) -> bool:
    return bool(_PORTAL_NUDGE_RE.match((text or "").strip()))


def is_knowledge_candidate_question(text: str) -> bool:
    """True when a parent message is worth turning into a Knowledge Hub entry.

    Reuses the greeting / ack / nudge classifiers so Admin and WhatsApp stay aligned.
    """
    question = (text or "").strip()
    if not question:
        return False
    if is_greeting_or_thanks(question):
        return False
    if is_confirmation_challenge(question):
        return False
    if is_calendar_portal_nudge(question):
        return False
    return True


def knowledge_candidates(interactions: list[dict]) -> list[dict]:
    """Parent interactions that can seed a Knowledge Hub entry (oldest first)."""
    rows: list[dict] = []
    for item in interactions:
        question = (item.get("question") or "").strip()
        if not is_knowledge_candidate_question(question):
            continue
        rows.append(item)
    rows.sort(key=lambda row: row.get("created_at") or "")
    return rows


def last_substantive_question(history: list[ConversationTurn] | list[dict[str, str]]) -> str | None:
    """Most recent parent question that was not a greeting/confirm/nudge."""
    turns = _as_turns(history)
    for turn in reversed(turns):
        q = (turn.question or "").strip()
        if not q:
            continue
        if is_greeting_or_thanks(q) or is_confirmation_challenge(q) or is_calendar_portal_nudge(q):
            continue
        return q
    return None


def rewrite_followup(
    question: str,
    history: list[ConversationTurn] | list[dict[str, str]] | None,
) -> str:
    """Turn short follow-ups into a standalone retrieval question.

    Retrieval and temporal parsing should use the rewritten text. The WhatsApp
    reply can still show the parent's original wording in the user prompt.
    """
    text = (question or "").strip()
    if not text:
        return text
    turns = _as_turns(history or [])
    prior = last_substantive_question(turns)

    if is_greeting_or_thanks(text):
        return text

    if prior and (is_confirmation_challenge(text) or is_calendar_portal_nudge(text)):
        return (
            f"{prior}\n\n"
            "Re-check using the official TIS Parent Calendar as the primary source. "
            "Confirm whether students have school that day."
        )

    if prior and _SHORT_DATE_FOLLOWUP_RE.match(text):
        return (
            f"Regarding the previous question ({prior}): {text}\n"
            "Answer from the TIS Parent Calendar when dates or school days are involved."
        )

    return text


def history_to_chat_messages(
    history: list[ConversationTurn] | list[dict[str, str]] | None,
    *,
    limit: int = 6,
) -> list[dict[str, str]]:
    """OpenAI-style messages from prior Q&A turns (oldest first)."""
    turns = _as_turns(history or [])
    if limit > 0:
        turns = turns[-limit:]
    messages: list[dict[str, str]] = []
    for turn in turns:
        if turn.question:
            messages.append({"role": "user", "content": turn.question})
        if turn.reply:
            messages.append({"role": "assistant", "content": turn.reply})
    return messages


DEFAULT_GREETING_REPLY = DEFAULT_GREETING_MESSAGE


def greeting_reply(language: str = "en", override: str | None = None) -> str:
    """Return the fixed greeting. Optional override comes from agent_config."""
    del language  # English-only greeting copy (admin may still customize via override).
    text = (override or "").strip()
    return text or DEFAULT_GREETING_REPLY


def _as_turns(
    history: list[ConversationTurn] | list[dict[str, str]],
) -> list[ConversationTurn]:
    out: list[ConversationTurn] = []
    pending_user: str | None = None
    for item in history:
        if isinstance(item, ConversationTurn):
            out.append(item)
            continue
        role = (item.get("role") or "").lower()
        content = (item.get("content") or "").strip()
        if role == "user":
            if pending_user is not None:
                out.append(ConversationTurn(question=pending_user, reply=""))
            pending_user = content
        elif role == "assistant" and pending_user is not None:
            out.append(ConversationTurn(question=pending_user, reply=content))
            pending_user = None
        elif item.get("question") is not None:
            out.append(
                ConversationTurn(
                    question=str(item.get("question") or ""),
                    reply=str(item.get("reply") or ""),
                )
            )
    if pending_user is not None:
        out.append(ConversationTurn(question=pending_user, reply=""))
    return out
