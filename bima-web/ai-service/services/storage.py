"""Minimal Supabase Storage uploader (REST) for annotated SAM3 results."""
import os
import uuid

import httpx


def _config():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di ai-service/.env.")
    return url.rstrip("/"), key


def upload_public(bucket: str, session_id: str, file_path: str, ext: str, content_type: str) -> str:
    """Upload a local file to `bucket` and return its public URL."""
    base, key = _config()
    object_path = f"sessions/{session_id}/sam3-{uuid.uuid4()}.{ext}"
    with open(file_path, "rb") as f:
        data = f.read()

    resp = httpx.post(
        f"{base}/storage/v1/object/{bucket}/{object_path}",
        content=data,
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": content_type,
            "Cache-Control": "max-age=31536000",
            "x-upsert": "false",
        },
        timeout=300.0,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Upload ke bucket '{bucket}' gagal ({resp.status_code}): {resp.text[:200]}")
    return f"{base}/storage/v1/object/public/{bucket}/{object_path}"
