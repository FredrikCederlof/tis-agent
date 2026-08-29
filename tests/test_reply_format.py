"""WhatsApp reply sanitizer — Markdown markers must not leak to parents."""

from tis_agent.reply_format import format_whatsapp_reply, strip_empty_source_line


HANDBOOK_QUOTE = (
    "The TGC campus is served by two primary stations: "
    "Takanawa Gateway Station and Sengakuji Station."
)


def test_spaced_source_underscores_become_whatsapp_italic():
    messy = (
        f'_ Source: Community Handbook 2026-2027 — "{HANDBOOK_QUOTE}" _'
    )
    out = format_whatsapp_reply(messy, has_evidence=True)
    assert out == (
        f'_Source: Community Handbook 2026-2027 — "{HANDBOOK_QUOTE}"_'
    )
    assert not out.startswith("_ ")
    assert not out.endswith(" _")


def test_already_correct_source_is_not_double_wrapped():
    clean = "_Source: TIS Parent Calendar_"
    assert format_whatsapp_reply(clean, has_evidence=True) == clean


def test_plain_source_line_is_italicized_when_evidence():
    out = format_whatsapp_reply(
        'Source: Community Handbook 2026-2027 — "short quote"',
        has_evidence=True,
    )
    assert out == '_Source: Community Handbook 2026-2027 — "short quote"_'


def test_plain_source_line_not_italicized_without_evidence():
    line = "Source: Community Handbook 2026-2027 — \"short quote\""
    assert format_whatsapp_reply(line, has_evidence=False) == line


def test_swedish_kalla_source_is_italicized():
    out = format_whatsapp_reply(
        "_ Källa: TIS Parent Calendar _",
        has_evidence=True,
    )
    assert out == "_Källa: TIS Parent Calendar_"


def test_markdown_list_and_bold_date_becomes_whatsapp_bold():
    out = format_whatsapp_reply(
        "* **August 31 (Monday):** Back to school",
        has_evidence=True,
    )
    assert out == "- *August 31 (Monday):* Back to school"
    assert "**" not in out


def test_ins5_messy_asterisks_and_word_joiner():
    messy = "*  **\u2060*August 31 (Monday)*:**"
    out = format_whatsapp_reply(messy, has_evidence=True)
    assert out == "- *August 31 (Monday):*"
    assert "**" not in out
    assert "\u2060" not in out


def test_empty_source_line_is_stripped():
    text = "I couldn't find that.\n\nSource: none found."
    assert strip_empty_source_line(text) == "I couldn't find that."
    out = format_whatsapp_reply(
        "I couldn't find that.\n\n_ Source: none found. _",
        has_evidence=True,
    )
    assert out == "I couldn't find that."
    assert "Source" not in out


def test_markdown_heading_and_double_underscore_bold():
    text = "# Uniform\n\nWinter uniform starts __1 November__."
    out = format_whatsapp_reply(text, has_evidence=False)
    assert out == "Uniform\n\nWinter uniform starts *1 November*."


def test_standalone_whatsapp_bold_is_preserved():
    assert (
        format_whatsapp_reply("*August 31 (Monday):*", has_evidence=False)
        == "*August 31 (Monday):*"
    )


def test_multiline_reply_source_and_date():
    text = (
        "* **August 31 (Monday):** Orientation\n\n"
        f'_ Source: Community Handbook 2026-2027 — "{HANDBOOK_QUOTE}" _'
    )
    out = format_whatsapp_reply(text, has_evidence=True)
    assert out.startswith("- *August 31 (Monday):* Orientation")
    assert out.endswith(
        f'_Source: Community Handbook 2026-2027 — "{HANDBOOK_QUOTE}"_'
    )
    assert "**" not in out
