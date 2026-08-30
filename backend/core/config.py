from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    minio_root_user: str = "ps26143admin"
    minio_root_password: str = "ps26143_minio_password"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None
    jwt_secret: str = "change_me_to_a_random_32_byte_string"
    copernicus_dataspace_user: str = ""
    copernicus_dataspace_pass: str = ""
    copernicus_marine_user: str = ""
    copernicus_marine_pass: str = ""
    cds_api_key: str = ""
    mlflow_tracking_uri: str = "http://localhost:5000"
    model_checkpoint_path: str = "/models/oil_segmentation/v1.0/model.pt"
    database_url: str = Field(
        default="postgresql+psycopg2://postgres@localhost:5432/SpillGuard"
    )
    minio_endpoint: str = "localhost:9000"
    minio_secure: bool = False
    minio_bucket: str = "ps26143"
    synthetic_ais_csv_path: str = "C:/Users/Rohithkumar/Downloads/synthetic_ais_contract_aligned_150_vessels_corrected.csv"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    synthetic_ingestion_enabled: bool = False
    synthetic_ingestion_batch_size: int = 5
    synthetic_ingestion_next_delay_seconds: int = 180

    model_config = SettingsConfigDict(env_file=BACKEND_ENV_FILE, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
