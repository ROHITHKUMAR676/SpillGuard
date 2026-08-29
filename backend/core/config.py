from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    postgres_password: str = "ps26143_dev_password"
    minio_root_user: str = "ps26143admin"
    minio_root_password: str = "ps26143_minio_password"
    redis_url: str = "redis://redis:6379/0"
    jwt_secret: str = "change_me_to_a_random_32_byte_string"
    copernicus_dataspace_user: str = ""
    copernicus_dataspace_pass: str = ""
    copernicus_marine_user: str = ""
    copernicus_marine_pass: str = ""
    cds_api_key: str = ""
    mlflow_tracking_uri: str = "http://mlflow:5000"
    model_checkpoint_path: str = "/models/oil_segmentation/v1.0/model.pt"
    database_url: str = Field(
        default="postgresql+psycopg2://ps26143:ps26143_dev_password@postgres:5432/ps26143"
    )
    minio_endpoint: str = "minio:9000"
    minio_secure: bool = False
    minio_bucket: str = "ps26143"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
