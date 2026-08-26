from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class WhatsAppSettings:
    token: str
    phone_number_id: str
    verify_token: str
    app_secret: str = ""
    business_account_id: str = ""


def get_whatsapp_settings() -> WhatsAppSettings:
    token = os.getenv("WHATSAPP_TOKEN", "").strip()
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN", "").strip()
    app_secret = os.getenv("WHATSAPP_APP_SECRET", "").strip()
    business_account_id = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", "").strip()

    missing = [
        name
        for name, value in [
            ("WHATSAPP_TOKEN", token),
            ("WHATSAPP_PHONE_NUMBER_ID", phone_number_id),
            ("WHATSAPP_VERIFY_TOKEN", verify_token),
        ]
        if not value
    ]
    if missing:
        raise SystemExit(
            "Missing WhatsApp env vars: "
            + ", ".join(missing)
            + ". See .env.example."
        )

    if len(verify_token) > 80:
        raise SystemExit(
            "WHATSAPP_VERIFY_TOKEN looks like an access token. "
            "Put the Meta access token in WHATSAPP_TOKEN and set "
            "WHATSAPP_VERIFY_TOKEN to a short string such as tis-tina-verify."
        )

    return WhatsAppSettings(
        token=token,
        phone_number_id=phone_number_id,
        verify_token=verify_token,
        app_secret=app_secret,
        business_account_id=business_account_id,
    )
