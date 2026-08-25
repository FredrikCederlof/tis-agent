from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_secret_key: str
    openai_api_key: str
    embedding_model: str = "text-embedding-3-small"
    chat_model: str = "gpt-4o-mini"
    handbook_path: Path = ROOT / "data" / "sources" / "community-handbook-2026-2027.pdf"
    handbook_title: str = "Community Handbook 2026-2027"
    drive_folder_id: str = "1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa"
    storage_bucket: str = "tis-ass"


def get_settings() -> Settings:
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_secret_key = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()

    missing = [
        name
        for name, value in [
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_SECRET_KEY", supabase_secret_key),
            ("OPENAI_API_KEY", openai_api_key),
        ]
        if not value
    ]
    if missing:
        raise SystemExit(f"Missing required env vars: {', '.join(missing)}")

    if not openai_api_key.startswith("sk-"):
        raise SystemExit(
            "OPENAI_API_KEY does not look valid. "
            "Create a key at https://platform.openai.com/api-keys "
            "(it should start with sk-) and put it in .env."
        )

    return Settings(
        supabase_url=supabase_url,
        supabase_secret_key=supabase_secret_key,
        openai_api_key=openai_api_key,
    )
