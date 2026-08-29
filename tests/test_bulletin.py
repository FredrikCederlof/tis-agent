"""Tests for weekly bulletin sanitization (child names and grade filters)."""

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


def test_keeps_kindergarten_class_notice() -> None:
    raw = """
From: pyp@tokyois.com
Subject: Kindergarten bag list

Kindergarten families should send a spare set of clothes on Monday.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "spare set of clothes" in result.markdown


def test_keeps_grade_3_class_notice() -> None:
    raw = """
From: pyp@tokyois.com
Subject: Grade 3 excursion

Grade 3 will visit the museum on 3 September. G3 parents must sign the form.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "museum" in result.markdown
    assert not contains_child_names(result.markdown)


def test_keeps_grade_6_class_notice() -> None:
    raw = """
From: myp@tokyois.com
Subject: Grade 6 camp

Grade 6 MYP students leave for camp on 8 September. G6 only.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "camp" in result.markdown


def test_keeps_homeroom_hopes_and_dreams_after_name_strip() -> None:
    raw = """
From: no-reply@toddleapp.com
Subject: School announcement: Welcome to 6B - Hopes and Dreams Conference

21 August 2026 Dear Eldor and Family, Welcome to the new school year.
Hopes & Dreams Parent Teacher Conference is Friday, August 28th, at 9:15 a.m.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks >= 1
    assert "Hopes" in result.markdown or "Dreams" in result.markdown
    assert "August 28" in result.markdown
    assert "Eldor" not in result.markdown
    assert not contains_child_names(result.markdown)


def test_drops_grade_10_only() -> None:
    raw = """
From: no-reply@toddleapp.com
Subject: School announcement: G10 PP Proposal Panel - Parent Volunteers

Dear TIS Parents and Carers, Our G10 students will present Personal Project
proposals starting Thursday September 10th. Please email if you can volunteer.
"""
    result = sanitize_bulletin(raw)
    assert "Personal Project" not in result.markdown
    assert result.kept_blocks == 0


def test_keeps_swimming_list_that_includes_grade_6() -> None:
    raw = """
From: no-reply@toddleapp.com
Subject: School announcement: Swimming: 6,8,10

Dear families, Next week we start aquatics in Grades 6, 8, and 10.
Wednesday: 6B - 1:40 - 3:20. Bring a swim cap and goggles.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks >= 1
    assert "goggles" in result.markdown or "6B" in result.markdown


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


def test_drops_personal_teacher_email_about_one_child() -> None:
    raw = """
=== MESSAGE ===
From: yukihi@tokyois.com
Date: 2026-08-28
Subject: Re: Japanese class belonging - Eldor

Dear Fredrik,
We understand Eldor's feelings about Japanese class placement.
Based on last year's assessments, Eldor has been placed in his current class for now.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 0
    assert "Japanese class" not in result.markdown
    assert "personal_teacher_to_child" in result.dropped_reasons


def test_drops_teacher_reply_on_class_announcement_thread() -> None:
    raw = """
=== MESSAGE ===
From: jaredba@tokyois.com
Subject: Re: School announcement: Hopes & Dreams - Welcome to 3B!

Hi Fredrik, I have corrected the form. I am looking forward to meeting Malte next week.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 0
    assert "Malte" not in result.markdown


def test_drops_openapply_one_child_admissions_mail() -> None:
    raw = """
=== MESSAGE ===
From: noreply@openapply.com
Subject: [Tokyo International School] Thank you for your interest in TIS !

You submitted information for your child Vega-Lo. Please click
https://tokyois.openapply.com/parents/password/edit?reset_password_token=SECRET
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 0
    assert "SECRET" not in result.markdown
    assert "Vega" not in result.markdown


def test_keeps_staff_operational_mail_without_child_names() -> None:
    raw = """
From: nanaim@tokyois.com
Subject: [Action Required] Emergency Contact Registration

Dear Parents, please complete the Emergency Contact section on OpenApply by Sunday the 23rd.
"""
    result = sanitize_bulletin(raw)
    assert result.kept_blocks == 1
    assert "Emergency Contact" in result.markdown


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
    result = sanitize_bulletin(
        "From: office@tokyois.com\n\nThe whole school picnic is on Saturday."
    )
    assert not contains_child_names(result.markdown)
