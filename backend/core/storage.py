from io import BytesIO

from minio import Minio
from minio.error import S3Error

from core.config import settings


def get_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_root_user,
        secret_key=settings.minio_root_password,
        secure=settings.minio_secure,
    )


def ensure_bucket() -> None:
    client = get_client()
    try:
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
    except S3Error:
        raise


def put_object(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    ensure_bucket()
    client = get_client()
    client.put_object(settings.minio_bucket, key, BytesIO(data), len(data), content_type=content_type)
    return key


def get_object(key: str) -> bytes:
    client = get_client()
    response = client.get_object(settings.minio_bucket, key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()
