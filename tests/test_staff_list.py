"""Staff role questions resolve against Staff List School, not the annual report."""

from tis_agent.ask import Evidence, _pin_staff_list
from tis_agent.staff_list import (
    format_staff_excerpt,
    is_staff_lookup_question,
    parse_staff_records,
    select_staff_records,
)

DIRECTORY = """
Department,Name,Title,Email
Upper School Teachers,Chrissy Erwin,G6B HR US English Teacher,christineer@tokyois.com,,,Staff List - Upper School Teachers.pdf,1
Upper School Teachers,Myk Villanuveva,G7A HR US PHE Teacher,mykvi@tokyois.com,,

,Staff List - Upper School Teachers.pdf,2
Upper School Teachers,Mayuka Pei,G7B HR US I&S Teacher,mayukape@tokyois.com,,,Staff List - Upper School Teachers.pdf,2
Lower School Teachers,Malgosia Lundin,LS PHE Teacher,malgosialu@tokyois.com,,,Staff List - Lower School Teachers.pdf,6
Leadership,Daniel Reynolds,Head of School,danielre@tokyois.com,,,Staff List - Leadership.pdf,1
Leadership,Kristen Pollard,DP Coordinator / G11 HR / DP English,kristenpo@tokyois.com,,,Staff List - Leadership.pdf,2
"""

PHE_MYP = "What’s the name of the phe teacher for the middle year program"


def test_role_question_is_a_staff_lookup():
    assert is_staff_lookup_question(PHE_MYP)
    assert is_staff_lookup_question("contacts to Myk Villanueva")
    assert is_staff_lookup_question("email for the school nurse")


def test_conferences_and_the_school_switchboard_are_not_staff_lookups():
    assert not is_staff_lookup_question(
        "Is the parent teacher conference this week with or without kids?"
    )
    assert not is_staff_lookup_question("What is the phone number to TIS?")
    assert not is_staff_lookup_question("How do I contact the school?")


def test_myp_phe_is_the_upper_school_row_only():
    records = parse_staff_records(DIRECTORY)
    picked, too_broad = select_staff_records(records, PHE_MYP)
    assert too_broad is False
    assert [row.name for row in picked] == ["Myk Villanuveva"]
    assert picked[0].email == "mykvi@tokyois.com"
    assert picked[0].programme() == "myp"


def test_pyp_phe_is_the_lower_school_row():
    records = parse_staff_records(DIRECTORY)
    picked, _too_broad = select_staff_records(records, "Who is the PYP PHE teacher?")
    assert [row.name for row in picked] == ["Malgosia Lundin"]
    assert picked[0].programme() == "pyp"


def test_misspelled_surname_still_matches_the_directory_spelling():
    records = parse_staff_records(DIRECTORY)
    picked, _too_broad = select_staff_records(records, "email for Myk Villanueva")
    assert [row.name for row in picked] == ["Myk Villanuveva"]


def test_excerpt_names_the_directory_and_not_the_annual_report():
    records = parse_staff_records(DIRECTORY)
    picked, too_broad = select_staff_records(records, PHE_MYP)
    text = format_staff_excerpt(picked, too_broad=too_broad)
    assert "Staff List School" in text
    assert "Myk Villanuveva" in text
    assert "Malgosia" not in text
    assert "Annual Report" not in text


def test_pin_puts_staff_list_first_and_drops_the_annual_report(monkeypatch):
    monkeypatch.setattr(
        "tis_agent.ask._load_staff_list_text",
        lambda _settings: DIRECTORY,
    )
    annual = Evidence(
        content="Our talented teachers come from around the world.",
        section_title=None,
        page_start=8,
        page_end=8,
        document_title="Annual Report 2024-25 - Linked to Toddle",
        similarity=0.62,
        source_type="pdf",
        chunk_id="annual-1",
    )
    pinned = _pin_staff_list(None, PHE_MYP, [annual])
    assert pinned[0].document_title == "Staff List School"
    assert "Myk Villanuveva" in pinned[0].content
    assert all("annual report" not in item.document_title.lower() for item in pinned)
