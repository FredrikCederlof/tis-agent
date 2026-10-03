"""Non-interactive Google Drive credentials for Railway cron."""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path

DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"


class DriveAuthError(RuntimeError):
    """Raised when Drive credentials are missing or unusable."""


def load_service_account_info() -> dict:
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if raw:
        return parse_service_account_json(raw)
    if path:
        try:
            return json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise DriveAuthError(
                f"Could not read GOOGLE_APPLICATION_CREDENTIALS file: {exc}"
            ) from exc
    raise DriveAuthError(
        "Google Drive credentials are not configured. "
        "Set GOOGLE_SERVICE_ACCOUNT_JSON to the service account key JSON "
        "(raw JSON or base64). Share the TIS knowledge folder with that "
        "service account email as a Viewer."
    )


def parse_service_account_json(raw: str) -> dict:
    text = raw.strip()
    if not text.startswith("{"):
        try:
            text = base64.b64decode(text, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as exc:
            raise DriveAuthError(
                "GOOGLE_SERVICE_ACCOUNT_JSON must be service account JSON, "
                "or base64 of that JSON."
            ) from exc
    try:
        info = json.loads(text)
    except json.JSONDecodeError as exc:
        raise DriveAuthError(
            "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON."
        ) from exc
    if not isinstance(info, dict) or "private_key" not in info or "client_email" not in info:
        raise DriveAuthError(
            "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key."
        )
    return info


def drive_access_token() -> tuple[str, str]:
    """Return (access_token, client_email) for the Drive readonly scope."""
    info = load_service_account_info()
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except ImportError as exc:
        raise DriveAuthError(
            "google-auth is not installed. Install dependencies from requirements.txt."
        ) from exc

    credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=[DRIVE_READONLY_SCOPE],
    )
    try:
        credentials.refresh(Request())
    except Exception as exc:
        raise DriveAuthError(
            f"Could not authenticate as {info.get('client_email')}: {exc}"
        ) from exc
    if not credentials.token:
        raise DriveAuthError("Google did not return an access token.")
    return str(credentials.token), str(info.get("client_email") or "")
