"""Tina tone of voice — fallbacks and greetings stay human, not helpdesk."""

from tis_agent.agent_config import (
    DEFAULT_GREETING_MESSAGE,
    DEFAULT_NO_EVIDENCE_MESSAGE,
    DEFAULT_NO_EVIDENCE_MESSAGES,
    DEFAULT_SYSTEM_PROMPT,
)
from tis_agent.conversation import DEFAULT_GREETING_REPLY, greeting_reply


BANNED = "official TIS source that answers that"


def test_no_evidence_defaults_avoid_helpdesk_phrase():
    assert BANNED not in DEFAULT_NO_EVIDENCE_MESSAGE
    assert all(BANNED not in message for message in DEFAULT_NO_EVIDENCE_MESSAGES)
    assert "I don't have enough information on that one." in DEFAULT_NO_EVIDENCE_MESSAGES


def test_prompt_forbids_formulaic_openers():
    assert "According to the information available" in DEFAULT_SYSTEM_PROMPT
    assert "fellow TIS parent" in DEFAULT_SYSTEM_PROMPT
    assert BANNED in DEFAULT_SYSTEM_PROMPT  # listed as a phrase to never use
    assert "Answering:" in DEFAULT_SYSTEM_PROMPT
    assert "official start time" in DEFAULT_SYSTEM_PROMPT


def test_admin_default_prompt_matches_python():
    from pathlib import Path

    ts = Path("admin/lib/default-system-prompt.ts").read_text()
    start = ts.find("`")
    end = ts.rfind("`")
    assert start != -1 and end > start
    extracted = ts[start + 1 : end].strip()
    assert extracted == DEFAULT_SYSTEM_PROMPT.strip()


def test_greeting_is_short_and_human():
    assert greeting_reply("en") == DEFAULT_GREETING_REPLY == DEFAULT_GREETING_MESSAGE
    assert "Hi — I'm Tina" in DEFAULT_GREETING_MESSAGE
    assert "information assistant" not in DEFAULT_GREETING_MESSAGE.lower()
