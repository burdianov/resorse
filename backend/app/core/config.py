"""Application settings.

Values are read from the environment, and from a local ``.env`` during
development. Production startup validation (secret strength, cookie and origin
settings) is added with the authentication work in F028/F060 — this file only
holds what exists today, so nothing here claims to be validated yet.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# The project keeps **one** .env, at the repository root, because Docker Compose
# reads that same file (`POSTGRES_*` there, `DATABASE_URL` here). It is located
# from this module rather than from the working directory: `uv run` may start in
# `backend/` or at the root, and a relative `env_file` silently finds nothing in
# one of those cases — which is exactly how it failed the first time (F023).
# Real environment variables still win over the file.
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        env_prefix="",
        extra="ignore",
    )

    # Neutral by default: BIG-PROMPT §0.2 forbids reusing the reference branding.
    app_name: str = "Application Platform"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"
    api_v1_prefix: str = "/api/v1"

    # Postgres 18, via asyncpg (ARCHITECTURE §8). Unset means "no database is
    # configured": the engine refuses to start rather than guessing, while
    # tasks that never touch the database (schema export, unit tests) keep
    # working without one. Production startup validation arrives with F060.
    database_url: str | None = None

    # Session lifetimes (ARCHITECTURE §3: "configurable, confirmed at F025").
    # F028 reads these when issuing a session row; the idle deadline moves
    # forward on activity but is capped at the absolute one, which never moves.
    # The defaults are the confirmed ones: 12 hours of inactivity, 30 days
    # regardless of activity.
    session_idle_timeout_minutes: int = 12 * 60
    session_absolute_lifetime_days: int = 30

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so the environment is parsed once per process."""
    return Settings()
