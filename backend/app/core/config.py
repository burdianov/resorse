"""Application settings.

Values are read from the environment, and from a local ``.env`` during
development. Production startup validation (secret strength, cookie and origin
settings) is added with the authentication work in F028/F060 — this file only
holds what exists today, so nothing here claims to be validated yet.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="",
        extra="ignore",
    )

    # Neutral by default: BIG-PROMPT §0.2 forbids reusing the reference branding.
    app_name: str = "Application Platform"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"
    api_v1_prefix: str = "/api/v1"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so the environment is parsed once per process."""
    return Settings()
