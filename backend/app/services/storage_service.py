from __future__ import annotations

import uuid
from pathlib import Path

import boto3
from botocore.client import BaseClient
from fastapi import UploadFile

from app.config import get_settings


def _s3_client() -> BaseClient | None:
    settings = get_settings()
    if not all(
        [
            settings.S3_ENDPOINT_URL,
            settings.S3_ACCESS_KEY_ID,
            settings.S3_SECRET_ACCESS_KEY,
            settings.S3_BUCKET_NAME,
        ]
    ):
        return None
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
    )


async def save_upload(file: UploadFile, *, prefix: str = "audio") -> str:
    """
    Persist upload to S3-compatible storage when configured; otherwise store under local ./uploads.
    Returns a URL or file path string suitable for audio_file_url.
    """
    settings = get_settings()
    ext = Path(file.filename or "blob").suffix or ".bin"
    key = f"{prefix}/{uuid.uuid4()}{ext}"
    data = await file.read()

    client = _s3_client()
    if client is not None:
        client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType=file.content_type or "application/octet-stream",
        )
        base = (settings.S3_PUBLIC_BASE_URL or settings.S3_ENDPOINT_URL or "").rstrip("/")
        bucket = settings.S3_BUCKET_NAME
        return f"{base}/{bucket}/{key}"

    local_dir = Path("uploads") / prefix
    local_dir.mkdir(parents=True, exist_ok=True)
    dest = local_dir / Path(key).name
    dest.write_bytes(data)
    return str(dest.resolve())
