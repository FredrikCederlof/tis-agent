from __future__ import annotations

from openai import OpenAI
from supabase import Client, create_client

from tis_agent.config import Settings

_openai_client: OpenAI | None = None
_openai_key: str | None = None
_supabase_client: Client | None = None
_supabase_key: tuple[str, str] | None = None


def make_openai(settings: Settings) -> OpenAI:
    global _openai_client, _openai_key
    if _openai_client is None or _openai_key != settings.openai_api_key:
        _openai_client = OpenAI(api_key=settings.openai_api_key)
        _openai_key = settings.openai_api_key
    return _openai_client


def make_supabase(settings: Settings) -> Client:
    global _supabase_client, _supabase_key
    key = (settings.supabase_url, settings.supabase_secret_key)
    if _supabase_client is None or _supabase_key != key:
        _supabase_client = create_client(settings.supabase_url, settings.supabase_secret_key)
        _supabase_key = key
    return _supabase_client


def embed_texts(client: OpenAI, model: str, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors: list[list[float]] = []
    batch_size = 64
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        response = client.embeddings.create(model=model, input=batch)
        # API returns in input order
        ordered = sorted(response.data, key=lambda item: item.index)
        vectors.extend(item.embedding for item in ordered)
    return vectors
