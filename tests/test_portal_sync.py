"""Tests for portal login form parsing."""

from tis_agent.portal_sync import _is_login_page, build_login_payload

SAMPLE_LOGIN_HTML = """
<form method="post" action="">
  <input name="username-38" id="username-38" value="" />
  <input name="user_password-38" id="user_password-38" value="" />
  <input type="hidden" name="form_id" value="38" />
  <input type="hidden" name="redirect_to" value="https://portal.tokyois.com/tis-times/" />
  <input type="hidden" name="_wpnonce" value="abc123" />
</form>
<div class="um um-login um-38"></div>
"""


def test_is_login_page() -> None:
    assert _is_login_page(SAMPLE_LOGIN_HTML)
    assert not _is_login_page("<html><body>TIS Times article</body></html>")


def test_build_login_payload() -> None:
    payload = build_login_payload(SAMPLE_LOGIN_HTML, "parent@example.com", "secret")
    assert payload["username-38"] == "parent@example.com"
    assert payload["user_password-38"] == "secret"
    assert payload["form_id"] == "38"
    assert payload["redirect_to"] == "https://portal.tokyois.com/tis-times/"
    assert payload["_wpnonce"] == "abc123"
