from __future__ import annotations

from supabase import Client

STORAGE_BUCKET = "tis-ass"


def storage_object_path(drive_file_id: str, filename: str) -> str:
    safe_name = filename.replace("/", "_")
    return f"sources/{drive_file_id}/{safe_name}"


def upload_bytes(
    supabase: Client,
    storage_path: str,
    data: bytes,
    *,
    content_type: str,
) -> None:
    bucket = supabase.storage.from_(STORAGE_BUCKET)
    bucket.upload(
        storage_path,
        data,
        file_options={"content-type": content_type, "upsert": "true"},
    )


def download_bytes(supabase: Client, storage_path: str) -> bytes:
    return supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
