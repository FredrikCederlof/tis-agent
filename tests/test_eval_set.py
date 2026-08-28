from tis_agent.eval_rag import score_reply
from tis_agent.eval_set import eval_cases


def test_eval_set_has_twenty_grounded_questions():
    cases = eval_cases()
    assert len(cases) == 20
    ids = [case.id for case in cases]
    assert len(ids) == len(set(ids))
    assert "today_events" in ids
    assert "report_absence" in ids


def test_score_reply_requires_expected_facts():
    case = next(c for c in eval_cases() if c.id == "school_start_time")
    ok = score_reply(case, "School officially starts at 8:10 AM.", "success", ["Handbook"])
    assert ok.pass_
    bad = score_reply(case, "I couldn't find an official TIS source.", "no_evidence", [])
    assert not bad.pass_


def test_score_reply_rejects_child_names():
    case = next(c for c in eval_cases() if c.id == "today_events")
    leaked = score_reply(
        case,
        "Hope and Dreams is today for Eldor in Grade 6.",
        "success",
        ["Bulletin"],
    )
    assert not leaked.pass_
    assert "eldor" in leaked.avoided_hits
