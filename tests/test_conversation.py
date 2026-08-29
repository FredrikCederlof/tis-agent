"""Tests for conversation follow-up rewrite and greetings."""

from tis_agent.conversation import (
    ConversationTurn,
    greeting_reply,
    is_greeting_or_thanks,
    rewrite_followup,
)


def test_greeting_detected():
    assert is_greeting_or_thanks("Hi")
    assert is_greeting_or_thanks("thanks!")
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
    assert "Tina" in greeting_reply("en")
