"""Tests for weekly bulletin sanitization (child names and grade-band filters)."""

from tis_agent.bulletin import contains_child_names, sanitize_bulletin, strip_child_names


TRIPLE_TODDLE = """
=== MESSAGE ===
From: notices@toddleapp.com
Date: 2026-08-25
Subject: Bus pickup change

Dear Eldor, the afternoon bus will leave at 15:20 from Monday. All parents should note the new time.

=== MESSAGE ===
From: notices@toddleapp.com
Date: 2026-08-25
Subject: Bus pickup change

Dear Malte, the afternoon bus will leave at 15:20 from Monday. All parents should note the new time.

=== MESSAGE ===
From: notices@toddleapp.com
Date: 2026-08-25
Subject: Bus pickup change

Dear Vega-Lo, the afternoon bus will leave at 15:20 from Monday. All parents should note the new time.
"""


def test_strips_eldor_malte_vega_variants() -> None:
    text = "Please remind Eldor, Malte, and Vega-Lo. Vega-lo and Vega have bags."
    cleaned, count = strip_child_names(text)
    assert count >= 5
    assert not contains_child_names(cleaned)
    assert "Eldor" not in cleaned
    assert "Malte" not in cleaned
    assert "Vega" not in cleaned


def test_drops_kindergarten_only() -> None:
    raw = """
From: pyp@tokyois.com
Subject: Kindergarten bag list

Kindergarten families should send a spare set of clothes on Monday.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 0
    assert "spare set of clothes" not in result.markdown


def test_drops_grade_3_only() -> None:
    raw = """
From: pyp@tokyois.com
Subject: Grade 3 excursion

Grade 3 will visit the museum on 3 September. G3 parents must sign the form.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 0
    assert "museum" not in result.markdown


def test_drops_grade_6_only() -> None:
    raw = """
From: myp@tokyois.com
Subject: Grade 6 camp

Grade 6 MYP students leave for camp on 8 September. G6 only.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 0
    assert "camp" not in result.markdown


def test_keeps_pyp_wide() -> None:
    raw = """
From: pyp@tokyois.com
Subject: PYP assembly

All PYP families are invited to Friday's assembly in the gym at 08:30.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "assembly" in result.markdown
    assert "08:30" in result.markdown


def test_keeps_myp_wide() -> None:
    raw = """
From: myp@tokyois.com
Subject: MYP conferences

All MYP parents should book student-led conferences in Toddle this week.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "student-led conferences" in result.markdown


def test_keeps_whole_school() -> None:
    raw = """
From: office@tokyois.com
Subject: Uniform

The whole school moves to winter uniform from 1 October.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "winter uniform" in result.markdown


def test_keeps_operational_without_grade() -> None:
    raw = """
From: office@tokyois.com
Subject: Campus gate

The Takanawa gate closes at 08:25. Late arrivals should use the lobby.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "08:25" in result.markdown


def test_all_pyp_with_grade_3_mention_is_kept() -> None:
    raw = """
From: pyp@tokyois.com
Subject: PYP Friday

All PYP classes including Grade 3 will present at the Friday assembly.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "Friday assembly" in result.markdown


def test_dedupes_triple_toddle_after_name_strip() -> None:
    result = sanitize_bulletin(TRIPLE_TODDLE)
    assert result.kept_blocks == 1
    assert result.child_mentions_removed >= 3
    assert "15:20" in result.markdown
    assert not contains_child_names(result.markdown)
    assert result.markdown.lower().count("15:20") == 1


def test_drops_personal_gmail_thread() -> None:
    raw = """
=== MESSAGE ===
From: friend@gmail.com
Subject: Playdate

Can Eldor come over after school on Tuesday?
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 0
    assert "Playdate" not in result.markdown


def test_strips_toddle_related_student_footer_and_keeps_school_wide() -> None:
    raw = """
From: no-reply@toddleapp.com
Subject: School announcement: Arrival and Dismissal

Dear TIS Community, updated arrival details are in the document.

Related students
MS
Malte Sterner Cederlöf
Grade 3

View announcement on Toddle
Stay connected, informed and involved, everywhere!
Toddle, East Cheery Lynn Road, Phoenix, AZ 85018, United States
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "arrival details" in result.markdown
    assert "Related student" not in result.markdown
    assert not contains_child_names(result.markdown)


def test_keeps_kindergarten_to_grade_range() -> None:
    raw = """
From: office@tokyois.com
Subject: New Family Orientation

1:00 - 2:00 PM Lower School Orientation (Kindergarten to Grade 5)
2:30 - 3:30 PM Upper School Orientation (Grade 6 to Grade 11)
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "Lower School Orientation" in result.markdown
    assert "Upper School Orientation" in result.markdown


def test_refuses_to_emit_if_names_cannot_be_stripped() -> None:
    # Safety: output must never include a child name.
    result = sanitize_bulletin(
        "From: office@tokyois.com\n\nThe whole school picnic is on Saturday."
    )
    assert not contains_child_names(result.markdown)
