"""Sanitizer rules for the weekly TIS bulletin ingest."""

from datetime import date

from tis_agent.bulletin import (
    bulletin_title,
    child_names_in,
    sanitize_dump,
    strip_child_names,
)

AS_OF = date(2026, 8, 28)

RAW_DUMP = """
=== MESSAGE ===
From: Toddle <notifications@toddleapp.com>
Date: Mon, 24 Aug 2026 08:00:00 +0900
Subject: Library books due Friday
Dear parents of Eldor,

Library books are due Friday for all PYP students. Please return them to the library.

=== MESSAGE ===
From: Toddle <notifications@toddleapp.com>
Date: Mon, 24 Aug 2026 08:00:01 +0900
Subject: Library books due Friday
Dear parents of Malte,

Library books are due Friday for all PYP students. Please return them to the library.

=== MESSAGE ===
From: Toddle <notifications@toddleapp.com>
Date: Mon, 24 Aug 2026 08:00:02 +0900
Subject: Library books due Friday
Dear parents of Vega-Lo,

Library books are due Friday for all PYP students. Please return them to the library.

=== MESSAGE ===
From: "TIS Kindergarten" <kindergarten@tokyois.com>
Date: Tue, 25 Aug 2026 09:00:00 +0900
Subject: Kindergarten spare clothes reminder
Kindergarten parents: please send a spare set of clothes for Kindergarten only. This does not apply to other grades.

=== MESSAGE ===
From: "Grade 3 Team" <pyp@tokyois.com>
Date: Tue, 25 Aug 2026 10:00:00 +0900
Subject: Grade 3 swimming bags
Grade 3 students need a labelled swimming bag this Thursday. Grade 3 only — other PYP classes are not swimming.

=== MESSAGE ===
From: "Grade 6 Team" <myp@tokyois.com>
Date: Tue, 25 Aug 2026 11:00:00 +0900
Subject: Grade 6 locker check
Grade 6 students must clear lockers on Friday. This Grade 6-only reminder is not for other MYP years.

=== MESSAGE ===
From: "TIS PYP" <pyp@tokyois.com>
Date: Wed, 26 Aug 2026 09:00:00 +0900
Subject: PYP parent workshop
All PYP families are invited to a parent workshop on inquiry learning next Tuesday in the gym.

=== MESSAGE ===
From: "TIS MYP" <myp@tokyois.com>
Date: Wed, 26 Aug 2026 10:00:00 +0900
Subject: MYP community project dates
MYP students should note the community project checkpoint dates published on ManageBac.

=== MESSAGE ===
From: "TIS DP" <dp@tokyois.com>
Date: Wed, 26 Aug 2026 11:00:00 +0900
Subject: DP CAS reflections
DP students need to submit CAS reflections before the end of next week.

=== MESSAGE ===
From: TIS Communications <communications@tokyois.com>
Date: Thu, 27 Aug 2026 08:00:00 +0900
Subject: Whole-school photo day
Whole school photo day is Friday. All students should wear the formal uniform.

=== MESSAGE ===
From: Google Drive <drive-noreply@google.com>
Date: Thu, 27 Aug 2026 12:00:00 +0900
Subject: Folder "Curriculum Guides" was changed
Items were added to the Curriculum Guides folder.

=== MESSAGE ===
From: Seesaw Marketing <hello@seesaw.me>
Date: Thu, 27 Aug 2026 13:00:00 +0900
Subject: Upgrade your Seesaw plan — limited time
Learn about pricing and upgrade your classroom. Unsubscribe from this list anytime.

=== MESSAGE ===
From: A Parent <parent.friend@gmail.com>
Date: Thu, 27 Aug 2026 14:00:00 +0900
Subject: Playdate this weekend?
Want to meet at the park on Saturday?

=== MESSAGE ===
From: Relatives <family@icloud.com>
Date: Thu, 27 Aug 2026 15:00:00 +0900
Subject: Photos from Sunday
Here are the photos.
"""


def test_bulletin_title_uses_tokyo_date():
    assert bulletin_title(AS_OF) == "TIS Weekly Bulletin 2026-08-28"


def test_strips_child_names():
    text = "Please remind Eldor, Malte, Vega-Lo, and Vega about hats."
    cleaned = strip_child_names(text)
    assert not child_names_in(cleaned)
    assert "Eldor" not in cleaned
    assert "Malte" not in cleaned
    assert "Vega" not in cleaned


def test_sanitize_keeps_programme_and_whole_school_notices():
    result = sanitize_dump(RAW_DUMP, as_of=AS_OF)
    md = result.markdown
    assert "TIS Weekly Bulletin 2026-08-28" in md
    assert "all PYP families" in md or "PYP parent workshop" in md
    assert "MYP students" in md
    assert "DP students" in md
    assert "Whole school photo day" in md
    assert "Library books are due Friday" in md


def test_sanitize_drops_grade_only_and_noise():
    result = sanitize_dump(RAW_DUMP, as_of=AS_OF)
    md = result.markdown.lower()
    assert "spare set of clothes" not in md
    assert "swimming bag" not in md
    assert "clear lockers" not in md
    assert "curriculum guides folder" not in md
    assert "upgrade your" not in md
    assert "playdate" not in md
    assert "photos from sunday" not in md
    assert result.dropped_reasons.get("grade_only", 0) >= 3
    assert result.dropped_reasons.get("folder_noise", 0) >= 1
    assert result.dropped_reasons.get("marketing", 0) >= 1
    assert result.dropped_reasons.get("personal", 0) >= 2


def test_toddle_send_is_deduped_once():
    result = sanitize_dump(RAW_DUMP, as_of=AS_OF)
    assert result.markdown.lower().count("library books are due friday") == 1
    assert result.dropped_reasons.get("duplicate", 0) >= 2


def test_child_names_absent_from_printed_markdown():
    result = sanitize_dump(RAW_DUMP, as_of=AS_OF)
    assert result.child_names_present is False
    assert not child_names_in(result.markdown)
    for name in ("Eldor", "Malte", "Vega-Lo", "Vega"):
        assert name not in result.markdown


def test_empty_dump_has_empty_status_payload():
    result = sanitize_dump("", as_of=AS_OF)
    assert result.threads_opened == 0
    assert result.blocks_kept == 0
    assert result.markdown == ""
    assert result.status_if_empty == ""
