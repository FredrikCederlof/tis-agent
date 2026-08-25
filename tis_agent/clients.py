from __future__ import annotations

from openai import OpenAI
from supabase import Client, create_client

from tis_agent.config import Settings


def make_openai(settings: Settings) -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


def make_supabase(settings: Settings) -> Client:
    return create_client(settings.supabase_url, settings.supabase_secret_key)


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
