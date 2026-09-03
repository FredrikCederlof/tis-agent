"""Tests for conversation follow-up rewrite and greetings."""

from tis_agent.agent_config import (
    AgentConfig,
    DEFAULT_NO_EVIDENCE_MESSAGES,
    DEFAULT_SYSTEM_PROMPT,
    pick_no_evidence_reply,
    _parse_no_evidence_messages,
)
from tis_agent.conversation import (
    ConversationTurn,
    DEFAULT_GREETING_REPLY,
    greeting_reply,
    is_greeting_or_thanks,
    rewrite_followup,
)


def test_greeting_detected():
    assert is_greeting_or_thanks("Hi")
    assert is_greeting_or_thanks("Hello")
    assert is_greeting_or_thanks("thanks!")
    assert is_greeting_or_thanks("Great")
    assert is_greeting_or_thanks("Got it")
    assert not is_greeting_or_thanks("Is it school tomorrow?")


def test_rewrite_are_you_sure_uses_prior_question():
    history = [
        ConversationTurn(
            question="Is it school on the 22nd of September?",
            reply="No — students do not have school.",
        )
    ]
    rewritten = rewrite_followup("Are u sure?", history)
    assert "22nd of September" in rewritten
    assert "Parent Calendar" in rewritten


def test_rewrite_what_about_keeps_prior_context():
    history = [
        {"role": "user", "content": "Please list student free days in September"},
        {"role": "assistant", "content": "September 22: PD day"},
    ]
    rewritten = rewrite_followup("What about 21st of September?", history)
    assert "previous question" in rewritten.lower() or "September" in rewritten


def test_greeting_reply_english():
    reply = greeting_reply("en")
    assert "Tina" in reply
    assert "calendar" in reply.lower()
    assert reply == DEFAULT_GREETING_REPLY


def test_greeting_reply_override():
    assert greeting_reply("en", "Hello from admin") == "Hello from admin"


def _config_with_pool(messages: tuple[str, ...]) -> AgentConfig:
    return AgentConfig(
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        fixed_answers=(),
        no_evidence_message=messages[0],
        no_evidence_messages=messages,
    )


def test_pick_no_evidence_avoids_consecutive_repeat():
    pool = (
        "Fallback one.",
        "Fallback two.",
        "Fallback three.",
    )
    config = _config_with_pool(pool)
    history = [
        {"role": "user", "content": "Odd question"},
        {"role": "assistant", "content": "Fallback one."},
    ]
    reply = pick_no_evidence_reply(config, question="Another odd question", history=history)
    assert reply in pool
    assert reply != "Fallback one."


def test_parse_no_evidence_messages_legacy_string():
    parsed = _parse_no_evidence_messages(None, "Legacy only message.")
    assert parsed[0] == "Legacy only message."
    assert DEFAULT_NO_EVIDENCE_MESSAGES[0] in parsed


def test_parse_no_evidence_messages_json_list():
    parsed = _parse_no_evidence_messages(
        ["Alpha fallback.", "Beta fallback."],
        "ignored when list present",
    )
    assert parsed == ("Alpha fallback.", "Beta fallback.")
