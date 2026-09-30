"""Staff Sandbox ask endpoint helpers (no WhatsApp, no interaction logging)."""

from __future__ import annotations

from typing import Any

from tis_agent.ask import answer_question


def normalize_history(raw: Any) -> list[dict[str, str]]:
    """Accept [{role, content}, ...] and keep only user/assistant turns."""
    if not isinstance(raw, list):
        return []
    history: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        history.append({"role": role, "content": content})
    return history[-12:]


def ask_sandbox(body: dict[str, Any]) -> dict[str, Any]:
    question = str(body.get("question") or "").strip()
    if not question:
        raise ValueError("question is required")
    history = normalize_history(body.get("history"))
    result = answer_question(question, history=history or None)
    return {
        "reply": result.reply,
        "language": result.language,
        "outcome": result.outcome,
        "evidence_count": result.evidence_count,
        "top_similarity": result.top_similarity,
        "document_titles": list(result.document_titles or []),
    }
