"""Load Tina system prompt and fixed answers from Supabase (Milestone 4 Phase B)."""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any

from tis_agent.clients import make_supabase
from tis_agent.config import Settings, get_settings

logger = logging.getLogger("tis_agent.agent_config")

CACHE_TTL_SECONDS = 60

DEFAULT_SYSTEM_PROMPT = """\
You are Tina, Tokyo International School's official information assistant for parents on WhatsApp.
You answer ONLY from the provided TIS document excerpts (handbook, fees, calendar, portal pages, etc.).
Parents rely on you for correct school information — accuracy beats helpfulness.

Grounding (non-negotiable):
- State only facts that are explicitly written in the excerpts. Do not invent, assume, or fill gaps.
- Do not infer who attends meetings, who is invited, eligibility, fees, dates, times, contacts, or procedures unless the excerpts say so clearly.
- If the excerpts describe a topic but do not answer the parent's exact question, say you cannot confirm that detail from official TIS sources. Do not guess.
- Never present an inference as a confirmed school rule. Prefer: "The handbook says …" over "You should …" when the text is descriptive.
- When the parent challenges you ("are you sure?", "but it says…"), re-check the excerpts. Agree with them only if the excerpts support their claim; otherwise correct gently with what the excerpts actually say, or say it is not specified.
- Do not flip answers to please the parent. Stay consistent with the documents.

Style:
- Reply in the same language as the parent's question.
- Be calm, concise, and practical. Optimize for WhatsApp: short, scannable, most important facts first.
- When useful, end with one citation line on its own line: _Source: Document title — "short quote"_ with no spaces inside the underscores. Prefer a short quote that supports the answer.
- You may bold dates or key facts with *text* (single asterisks). Never use Markdown **double asterisks**, headings, or tables.
- Use "- item" for lists, not "* item".
- Today's date is {today} (Asia/Tokyo school calendar). TIS school weeks are Monday to Friday.
- If the parent asked about a specific day or date range, ignore excerpts that refer to other dates.
- For what is happening on a date, treat the TIS Parent Calendar as the main schedule source. Use the handbook, weekly bulletin, and other documents too. TIS Times is portal news, not the school calendar — do not conclude that nothing is happening solely because TIS Times has no posts. The weekly bulletin is sanitized school mail (names removed; no 1:1 teacher notes), not the calendar.
"""

DEFAULT_NO_EVIDENCE_MESSAGE = (
    "I couldn't find an official TIS source that answers that."
)

DEFAULT_NO_EVIDENCE_MESSAGES: tuple[str, ...] = (
    "I don't have enough verified TIS information to answer that confidently.",
    "I wasn't able to confirm that from the TIS information I have access to.",
    "I can't find a clear answer to that in the available TIS information.",
    "It looks like this isn't covered in the TIS information currently available to me.",
    "I couldn't verify this from the available TIS information.",
    "I don't have a reliable TIS source for that yet. Feel free to rephrase or add a bit more detail.",
    "I'm not seeing anything in the TIS information that clearly answers this.",
    "That one doesn't seem to be covered clearly in the information I have.",
)

DEFAULT_GREETING_MESSAGE = (
    "Hi! I'm Tina. What can I help you with today?\n"
    "I answer from official TIS information — calendar, absences, school times, and more."
)

# text-embedding-3-small scores for real TIS matches often land ~0.40–0.65;
# 0.72 was only useful as a "strong success" analytics bar and blocked almost all answers.
DEFAULT_SIMILARITY_THRESHOLD = 0.40
DEFAULT_STRICT_GROUNDING = True

DEFAULT_FIXED_ANSWERS: list[dict[str, Any]] = [
    {
        "key": "who_are_you",
        "enabled": True,
        "patterns": [
            "who are you",
            "what are you",
            "who is tina",
            "what is tina",
        ],
        "en": (
            "I'm Tina, the Tokyo International School information assistant for parents. "
            "I answer questions from official TIS documents on WhatsApp."
        ),
    },
    {
        "key": "who_created_you",
        "enabled": True,
        "patterns": [
            "who created you",
            "who built you",
            "who made you",
            "who developed you",
            "who runs you",
        ],
        "en": (
            "I'm Tina, built by Insight Works in partnership with Tokyo International School "
            "to help parents find official school information quickly on WhatsApp."
        ),
    },
]


@dataclass(frozen=True)
class FixedAnswer:
    key: str
    patterns: tuple[str, ...]
    reply: str
    enabled: bool = True


@dataclass(frozen=True)
class AgentConfig:
    system_prompt: str
    fixed_answers: tuple[FixedAnswer, ...]
    strict_grounding: bool = DEFAULT_STRICT_GROUNDING
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD
    no_evidence_message: str = DEFAULT_NO_EVIDENCE_MESSAGE
    no_evidence_messages: tuple[str, ...] = DEFAULT_NO_EVIDENCE_MESSAGES
    greeting_message: str = DEFAULT_GREETING_MESSAGE


_cache: AgentConfig | None = None
_cache_loaded_at: float = 0.0


def invalidate_config_cache() -> None:
    global _cache, _cache_loaded_at
    _cache = None
    _cache_loaded_at = 0.0


def _strip_legacy_source_suffix(text: str) -> str:
    cleaned = re.sub(
        r"\n\nSource:\s*none found\.?\s*$",
        "",
        (text or "").strip(),
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


def _parse_no_evidence_messages(raw: Any, legacy: str) -> tuple[str, ...]:
    """Build the fallback pool from jsonb, legacy text, or code defaults."""
    messages: list[str] = []
    if isinstance(raw, dict):
        raw = raw.get("en") or raw.get("messages") or []
    if isinstance(raw, list):
        for item in raw:
            text = _strip_legacy_source_suffix(str(item or ""))
            if text and text not in messages:
                messages.append(text)
    if not messages:
        legacy_clean = _strip_legacy_source_suffix(legacy)
        if legacy_clean:
            messages.append(legacy_clean)
        for item in DEFAULT_NO_EVIDENCE_MESSAGES:
            if item not in messages:
                messages.append(item)
    return tuple(messages)


def pick_no_evidence_reply(
    config: AgentConfig,
    *,
    question: str = "",
    history: list[dict[str, str]] | None = None,
) -> str:
    """Choose a short fallback; avoid repeating the last assistant reply when possible."""
    pool = [m.strip() for m in config.no_evidence_messages if m and m.strip()]
    if not pool:
        pool = [_strip_legacy_source_suffix(config.no_evidence_message) or DEFAULT_NO_EVIDENCE_MESSAGE]

    last_assistant = ""
    for item in reversed(history or []):
        if (item.get("role") or "").lower() == "assistant":
            last_assistant = (item.get("content") or "").strip()
            break
        if item.get("reply"):
            last_assistant = str(item.get("reply") or "").strip()
            break

    candidates = [m for m in pool if m != last_assistant] or pool
    seed = f"{last_assistant}\n{question.strip().lower()}"
    idx = abs(hash(seed)) % len(candidates)
    return candidates[idx]


def _parse_fixed_answers(raw: Any) -> tuple[FixedAnswer, ...]:
    if not isinstance(raw, list):
        return tuple(_parse_fixed_answer(item) for item in DEFAULT_FIXED_ANSWERS)

    parsed: list[FixedAnswer] = []
    for item in raw:
        try:
            parsed.append(_parse_fixed_answer(item))
        except (TypeError, ValueError):
            logger.warning("Skipping invalid fixed answer entry: %r", item)
    return tuple(parsed)


def _parse_fixed_answer(item: dict[str, Any]) -> FixedAnswer:
    key = str(item["key"])
    patterns = tuple(str(p).lower().strip() for p in item.get("patterns") or [] if str(p).strip())
    reply = str(item.get("en") or item.get("reply") or "").strip()
    if not key or not patterns or not reply:
        raise ValueError(f"fixed answer {key!r} missing required fields")
    return FixedAnswer(
        key=key,
        patterns=patterns,
        reply=reply,
        enabled=bool(item.get("enabled", True)),
    )


def _normalize(text: str) -> str:
    lowered = text.lower().strip()
    cleaned = re.sub(r"[^\w\såäö]", " ", lowered, flags=re.UNICODE)
    return " ".join(cleaned.split())


def load_agent_config(settings: Settings | None = None) -> AgentConfig:
    """Return cached Tina config, loading from Supabase when stale."""
    global _cache, _cache_loaded_at

    now = time.monotonic()
    if _cache is not None and now - _cache_loaded_at < CACHE_TTL_SECONDS:
        return _cache

    settings = settings or get_settings()
    strict = DEFAULT_STRICT_GROUNDING
    threshold = DEFAULT_SIMILARITY_THRESHOLD
    no_evidence = DEFAULT_NO_EVIDENCE_MESSAGE
    no_evidence_pool: tuple[str, ...] = DEFAULT_NO_EVIDENCE_MESSAGES
    greeting = DEFAULT_GREETING_MESSAGE
    try:
        sb = make_supabase(settings)
        try:
            row = (
                sb.table("agent_config")
                .select(
                    "system_prompt, fixed_answers, strict_grounding, "
                    "similarity_threshold, no_evidence_message, "
                    "no_evidence_messages, greeting_message"
                )
                .eq("id", 1)
                .single()
                .execute()
            )
            data = row.data or {}
            strict = bool(data.get("strict_grounding", DEFAULT_STRICT_GROUNDING))
            threshold = float(data.get("similarity_threshold") or DEFAULT_SIMILARITY_THRESHOLD)
            no_evidence = (
                _strip_legacy_source_suffix(data.get("no_evidence_message") or "")
                or DEFAULT_NO_EVIDENCE_MESSAGE
            )
            no_evidence_pool = _parse_no_evidence_messages(
                data.get("no_evidence_messages"),
                no_evidence,
            )
            greeting = (
                (data.get("greeting_message") or "").strip() or DEFAULT_GREETING_MESSAGE
            )
        except Exception as inner:
            err = str(inner)
            if "strict_grounding" not in err and "no_evidence_messages" not in err and "greeting_message" not in err:
                raise
            logger.warning("agent_config policy columns missing — run sql/005_admin.sql / sql/008_fallback_messages.sql")
            row = (
                sb.table("agent_config")
                .select("system_prompt, fixed_answers, no_evidence_message")
                .eq("id", 1)
                .single()
                .execute()
            )
            data = row.data or {}
            legacy = _strip_legacy_source_suffix(data.get("no_evidence_message") or "")
            if legacy:
                no_evidence = legacy
            no_evidence_pool = _parse_no_evidence_messages(None, no_evidence)
        prompt = (data.get("system_prompt") or "").strip() or DEFAULT_SYSTEM_PROMPT
        fixed = _parse_fixed_answers(data.get("fixed_answers"))
    except Exception:
        logger.exception("Failed to load agent_config; using defaults")
        prompt = DEFAULT_SYSTEM_PROMPT
        fixed = _parse_fixed_answers(DEFAULT_FIXED_ANSWERS)
        strict = DEFAULT_STRICT_GROUNDING
        threshold = DEFAULT_SIMILARITY_THRESHOLD
        no_evidence = DEFAULT_NO_EVIDENCE_MESSAGE
        no_evidence_pool = DEFAULT_NO_EVIDENCE_MESSAGES
        greeting = DEFAULT_GREETING_MESSAGE

    _cache = AgentConfig(
        system_prompt=prompt,
        fixed_answers=fixed,
        strict_grounding=strict,
        similarity_threshold=threshold,
        no_evidence_message=no_evidence_pool[0] if no_evidence_pool else no_evidence,
        no_evidence_messages=no_evidence_pool,
        greeting_message=greeting,
    )
    _cache_loaded_at = now
    return _cache


def match_fixed_answer(
    question: str,
    config: AgentConfig,
) -> tuple[str, str] | None:
    """Return (fixed_answer_key, reply) when question matches an enabled rule."""
    normalized = _normalize(question)
    if not normalized:
        return None

    for rule in config.fixed_answers:
        if not rule.enabled:
            continue
        for pattern in rule.patterns:
            if _normalize(pattern) in normalized:
                return rule.key, rule.reply
    return None
