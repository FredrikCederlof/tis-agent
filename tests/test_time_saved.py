from tis_agent.time_saved import (
    clamp_minutes_per_question,
    format_saved_time,
    format_saved_time_delta,
    is_tina_handled,
    time_saved_minutes,
)


def test_mixed_outcomes_count_only_tina_handled():
    rows = [
        ("success", None),
        ("success", "2026-01-01T00:00:00Z"),
        ("no_evidence", None),
        ("error", None),
        ("fixed_answer", None),
        ("low_confidence", None),
        ("success", None),
    ]
    handled = sum(1 for outcome, human in rows if is_tina_handled(outcome, human))
    assert handled == 2
    assert format_saved_time(handled * 5) == "10m"
    assert is_tina_handled("success") is True
    assert is_tina_handled("success", None) is True
    assert is_tina_handled("success", "2026-09-10T00:00:00Z") is False
    assert is_tina_handled("fixed_answer") is False
    assert is_tina_handled("no_evidence") is False
    assert is_tina_handled("low_confidence") is False
    assert is_tina_handled("error") is False


def test_format_under_sixty_minutes():
    assert format_saved_time(0) == "0m"
    assert format_saved_time(45) == "45m"
    assert format_saved_time(59) == "59m"


def test_format_hours_and_minutes():
    assert format_saved_time(60) == "1h"
    assert format_saved_time(82 * 5) == "6h 50m"
    assert format_saved_time(82 * 3) == "4h 6m"
    assert format_saved_time(82 * 7) == "9h 34m"
    assert format_saved_time(1470) == "24h 30m"


def test_does_not_convert_to_days():
    assert format_saved_time(24 * 60) == "24h"
    assert format_saved_time(25 * 60 + 15) == "25h 15m"


def test_config_change_scales_saved_time():
    handled = 82
    assert format_saved_time(handled * 5) == "6h 50m"
    assert format_saved_time(handled * 3) == "4h 6m"
    assert format_saved_time(handled * 7) == "9h 34m"


def test_period_comparison_formats_delta():
    current = 82 * 5
    previous = 410 - 80
    assert format_saved_time_delta(current, previous) == "↑ 1h 20m"
    assert format_saved_time_delta(100, 160) == "↓ 1h"
    assert format_saved_time_delta(0, 0) == "→ 0m"
    assert format_saved_time_delta(410, 0) == "↑ 6h 50m"


def test_time_saved_uses_config_minutes():
    assert time_saved_minutes(82, 5) == 410
    assert time_saved_minutes(82, 3) == 246
    assert time_saved_minutes(82, 7) == 574
    assert format_saved_time(time_saved_minutes(82, 5)) == "6h 50m"
    assert time_saved_minutes(0, 5) == 0
    assert time_saved_minutes(82, None) == 410


def test_clamp_minutes_per_question():
    assert clamp_minutes_per_question(5) == 5
    assert clamp_minutes_per_question(0) == 1
    assert clamp_minutes_per_question(-3) == 1
    assert clamp_minutes_per_question(999) == 180
    assert clamp_minutes_per_question("7") == 7
    assert clamp_minutes_per_question("nope") == 5
