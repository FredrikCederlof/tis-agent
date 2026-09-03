"""Chat bubbles must render Tina's WhatsApp text as readable HTML."""

from tis_agent.wa_markup import parse_blocks, render_html, tokenize_inline

DRESS_CODE_REPLY = (
    "Yes, there is a dress code at TIS. Here are some key points:\n"
    "\n"
    "- Clothing must provide full coverage of the shoulders, upper- and mid-section.\n"
    "- Pajamas and costumes are only allowed on school-sanctioned Spirit Days.\n"
    "\n"
    "It's all about being ready for school.\n"
    "\n"
    '_Source: Community Handbook 2026-2027 — "We value our diversity."_'
)


def test_bullet_list_becomes_list_items_not_one_long_line():
    html = render_html(DRESS_CODE_REPLY)
    assert html.count("<li>") == 2
    assert "<ul>" in html
    assert "- Clothing" not in html


def test_paragraphs_split_on_blank_lines():
    blocks = parse_blocks(DRESS_CODE_REPLY)
    kinds = [block["type"] for block in blocks]
    assert kinds == ["paragraph", "list", "paragraph", "paragraph"]


def test_source_line_renders_as_italics_without_underscores():
    html = render_html(DRESS_CODE_REPLY)
    assert "<em>Source: Community Handbook 2026-2027 — &quot;We value our diversity.&quot;</em>" in html
    assert "_Source" not in html


def test_whatsapp_bold_renders_as_strong():
    assert render_html("*31 August:* Back to school") == (
        "<p><strong>31 August:</strong> Back to school</p>"
    )


def test_underscores_inside_words_are_not_italics():
    assert tokenize_inline("drive_file_id stays plain") == [
        {"kind": "text", "text": "drive_file_id stays plain"}
    ]


def test_hyphen_inside_sentence_is_not_a_bullet():
    blocks = parse_blocks("Coverage of the upper- and mid-section is required.")
    assert [block["type"] for block in blocks] == ["paragraph"]


def test_html_in_message_text_is_escaped():
    html = render_html("<script>alert(1)</script>")
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_single_newline_keeps_a_soft_break():
    assert render_html("Line one\nLine two") == "<p>Line one<br />Line two</p>"


def test_numbered_steps_render_as_ordered_list():
    html = render_html("1. Email the office\n2. Call reception")
    assert html.startswith("<ol>")
    assert html.count("<li>") == 2


def test_empty_reply_renders_nothing():
    assert render_html("") == ""
