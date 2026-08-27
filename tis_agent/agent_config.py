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
You are Tina, a Tokyo International School (TIS) information assistant for parents.
You answer only from the provided TIS document excerpts.

Rules:
- Reply in the same language as the parent's question.
- Be helpful, calm, concise, and practical.
- Optimize for WhatsApp: short, scannable, most important facts first.
- Do not invent school policies, dates, times, or procedures.
- If the excerpts are not enough, say you could not confirm it from official TIS sources.
- Prefer Confirmed facts stated in the excerpts. If you must lightly interpret, mark it as Inferred.
- When useful, end with one citation line on its own line: _Source: …_ (WhatsApp italics using underscores).
- Do not use markdown headings or tables. Plain text and short numbered lists are fine.
- Do not use markdown bold (**text**). Only the source line may use underscore italics.
- Today's date is {today}.
"""

DEFAULT_NO_EVIDENCE_MESSAGE = (
    "I couldn't find an official TIS source that answers that."
)

DEFAULT_SIMILARITY_THRESHOLD = 0.72
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


_cache: AgentConfig | None = None
_cache_loaded_at: float = 0.0


def invalidate_config_cache() -> None:
    global _cache, _cache_loaded_at
    _cache = None
    _cache_loaded_at = 0.0


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
    try:
        sb = make_supabase(settings)
        try:
            row = (
                sb.table("agent_config")
                .select(
                    "system_prompt, fixed_answers, strict_grounding, "
                    "similarity_threshold, no_evidence_message"
                )
                .eq("id", 1)
                .single()
                .execute()
            )
            data = row.data or {}
            strict = bool(data.get("strict_grounding", DEFAULT_STRICT_GROUNDING))
            threshold = float(data.get("similarity_threshold") or DEFAULT_SIMILARITY_THRESHOLD)
            no_evidence = (
                (data.get("no_evidence_message") or "").strip() or DEFAULT_NO_EVIDENCE_MESSAGE
            )
        except Exception as inner:
            if "strict_grounding" not in str(inner):
                raise
            logger.warning("agent_config policy columns missing — run sql/005_admin.sql")
            row = (
                sb.table("agent_config")
                .select("system_prompt, fixed_answers")
                .eq("id", 1)
                .single()
                .execute()
            )
            data = row.data or {}
        prompt = (data.get("system_prompt") or "").strip() or DEFAULT_SYSTEM_PROMPT
        fixed = _parse_fixed_answers(data.get("fixed_answers"))
    except Exception:
        logger.exception("Failed to load agent_config; using defaults")
        prompt = DEFAULT_SYSTEM_PROMPT
        fixed = _parse_fixed_answers(DEFAULT_FIXED_ANSWERS)
        strict = DEFAULT_STRICT_GROUNDING
        threshold = DEFAULT_SIMILARITY_THRESHOLD
        no_evidence = DEFAULT_NO_EVIDENCE_MESSAGE

    _cache = AgentConfig(
        system_prompt=prompt,
        fixed_answers=fixed,
        strict_grounding=strict,
        similarity_threshold=threshold,
        no_evidence_message=no_evidence,
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
