"""Minimal Supabase Storage uploader (REST) for annotated SAM3 results."""
import os
import uuid

import httpx


def _config():
    # Upload from the private Docker network, but return URLs that browsers can reach.
    url = os.getenv("SUPABASE_INTERNAL_URL") or os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    public_url = os.getenv("SUPABASE_PUBLIC_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or url
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not public_url or not key:
        raise RuntimeError("SUPABASE_INTERNAL_URL / SUPABASE_PUBLIC_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di ai-service/.env.")
    return url.rstrip("/"), public_url.rstrip("/"), key


def upload_public(bucket: str, session_id: str, file_path: str, ext: str, content_type: str) -> str:
    """Upload a local file to `bucket` and return its public URL."""
    base, public_base, key = _config()
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
    return f"{public_base}/storage/v1/object/public/{bucket}/{object_path}"
