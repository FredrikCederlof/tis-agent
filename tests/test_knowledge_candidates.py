"""Knowledge Hub question candidates from a chat session."""

from tis_agent.conversation import (
    is_greeting_or_thanks,
    is_knowledge_candidate_question,
    knowledge_candidates,
)


def test_greeting_acks_are_not_knowledge_candidates() -> None:
    for text in ("Hi", "Thanks", "Okay", "Great", "Got it", "Sounds good", "👍"):
        assert is_greeting_or_thanks(text) or not is_knowledge_candidate_question(text)
        assert is_knowledge_candidate_question(text) is False


def test_real_school_questions_are_candidates() -> None:
    assert is_knowledge_candidate_question("How do I report that my child will be absent today?")
    assert is_knowledge_candidate_question("Who do I contact about lost and found items?")
    assert is_knowledge_candidate_question("I think I should report it in Toddle, correct?")


def test_confirmations_and_nudges_are_not_candidates() -> None:
    assert is_knowledge_candidate_question("Are you sure?") is False
    assert is_knowledge_candidate_question("Check the calendar") is False


def test_knowledge_candidates_filters_and_keeps_order() -> None:
    rows = [
        {
            "id": "i3",
            "question": "Who do I contact about lost and found items?",
            "created_at": "2026-09-03T00:20:00+00:00",
            "reply": "Email reception.",
        },
        {
            "id": "i1",
            "question": "Hi",
            "created_at": "2026-09-03T00:17:00+00:00",
            "reply": "Hello!",
        },
        {
            "id": "i2",
            "question": "How do I report an absence?",
            "created_at": "2026-09-03T00:18:00+00:00",
            "reply": "Use Toddle.",
        },
        {
            "id": "i4",
            "question": "Thanks",
            "created_at": "2026-09-03T00:21:00+00:00",
            "reply": "You're welcome.",
        },
    ]
    picked = knowledge_candidates(rows)
    assert [row["id"] for row in picked] == ["i2", "i3"]
    assert picked[0]["reply"] == "Use Toddle."


def test_empty_and_blank_questions_are_dropped() -> None:
    assert knowledge_candidates([{"id": "x", "question": "   ", "created_at": "2026-09-03T00:00:00+00:00"}]) == []
