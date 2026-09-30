"""Admin-facing English translation for stored interactions (INS-21).

Translates parent questions and Tina replies for Tina Admin only.
Never overwrites the original `question` / `reply` fields. Failures are
soft: the inbound WhatsApp message is already stored before this runs.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from tis_agent.clients import make_openai, make_supabase
from tis_agent.config import Settings, get_settings

logger = logging.getLogger("tis_agent.translate_admin")

STATUS_PENDING = "pending"
STATUS_DONE = "done"
STATUS_SKIPPED = "skipped"
STATUS_FAILED = "failed"

_NON_ASCII_LETTER = re.compile(r"[^\x00-\x7F]")


def is_english_language(language: str | None) -> bool:
    code = (language or "en").strip().lower().split("-")[0].split("_")[0]
    return code in ("", "en")


def looks_like_english(text: str) -> bool:
    sample = (text or "").strip()
    if not sample:
        return True
    letters = re.sub(r"[^A-Za-zÀ-öø-ÿ]", "", sample)
    if not letters:
        return True
    ascii_letters = re.sub(r"[^A-Za-z]", "", letters)
    return (len(ascii_letters) / len(letters)) >= 0.92


def should_translate(text: str, language: str | None) -> bool:
    if not (text or "").strip():
        return False
    if is_english_language(language):
        return False
    if looks_like_english(text):
        return False
    return True


def _translate_texts(client: Any, texts: list[str]) -> list[str] | None:
    numbered = "\n\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You translate school-parent WhatsApp messages into clear English "
                    "for administrators. Keep meaning, names, dates, and document titles. "
                    "Do not add commentary. Return ONLY a JSON array of English strings "
                    "in the same order as the numbered inputs."
                ),
            },
            {
                "role": "user",
                "content": f"Translate each numbered item to English.\n\n{numbered}",
            },
        ],
    )
    content = (response.choices[0].message.content or "").strip()
    import json

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    raw = (fenced.group(1) if fenced else content).strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list) or len(parsed) != len(texts):
        return None
    return [str(item or "") for item in parsed]


def enrich_interaction_translation(
    interaction_id: str,
    *,
    question: str,
    reply: str | None,
    language: str,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Translate and patch one interaction. Safe to call after insert."""
    settings = settings or get_settings()
    source_language = (language or "en").strip() or "en"
    q = (question or "").strip()
    r = (reply or "").strip() if reply else ""

    need_q = should_translate(q, source_language)
    need_r = should_translate(r, source_language) if r else False

    patch: dict[str, Any] = {"source_language": source_language}

    if not need_q and not need_r:
        patch["translation_status"] = STATUS_SKIPPED
        if not need_q and q:
            patch["question_en"] = q
        if r and not need_r:
            patch["reply_en"] = r
        _apply_patch(interaction_id, patch, settings)
        return {"status": STATUS_SKIPPED, **patch}

    patch["translation_status"] = STATUS_PENDING
    _apply_patch(interaction_id, patch, settings)

    try:
        client = make_openai(settings)
        to_send: list[str] = []
        keys: list[str] = []
        if need_q:
            to_send.append(q)
            keys.append("question_en")
        if need_r:
            to_send.append(r)
            keys.append("reply_en")
        translated = _translate_texts(client, to_send)
        if not translated:
            raise RuntimeError("Could not parse translation response")
        for key, value in zip(keys, translated):
            if value.strip():
                patch[key] = value.strip()
        if not need_q and q:
            patch["question_en"] = q
        if r and not need_r:
            patch["reply_en"] = r
        patch["translation_status"] = STATUS_DONE
        _apply_patch(interaction_id, patch, settings)
        return {"status": STATUS_DONE, **patch}
    except Exception:
        logger.exception("Admin translation failed for interaction %s", interaction_id)
        fail = {
            "source_language": source_language,
            "translation_status": STATUS_FAILED,
        }
        _apply_patch(interaction_id, fail, settings)
        return {"status": STATUS_FAILED, **fail}


def _apply_patch(interaction_id: str, patch: dict[str, Any], settings: Settings) -> None:
    try:
        sb = make_supabase(settings)
        sb.table("interactions").update(patch).eq("id", interaction_id).execute()
    except Exception:
        logger.exception("Failed to store translation fields for %s", interaction_id)


def retry_failed_translation(
    interaction_id: str,
    *,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Controlled retry for rows marked failed / pending."""
    settings = settings or get_settings()
    sb = make_supabase(settings)
    result = (
        sb.table("interactions")
        .select("id, question, reply, language, translation_status, question_en")
        .eq("id", interaction_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return {"status": "missing"}
    row = rows[0]
    if row.get("question_en") and row.get("translation_status") == STATUS_DONE:
        return {"status": "reused", "question_en": row["question_en"]}
    return enrich_interaction_translation(
        interaction_id,
        question=str(row.get("question") or ""),
        reply=row.get("reply"),
        language=str(row.get("language") or "en"),
        settings=settings,
    )
