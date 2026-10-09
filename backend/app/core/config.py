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

    # Password policy (F026; BP-6.1d: "strong configurable password policy").
    # The Argon2 parameters themselves are deliberately **not** settings: a
    # deployment that can quietly weaken the hash function is a foot-gun, so
    # those are reviewed constants in app/core/security.py. What is policy —
    # bound lengths, the denylist, login throttling — is configurable here.
    password_min_length: int = 12
    password_max_length: int = 128

    # Login throttling (F026 primitives; F028 builds the buckets per account
    # and per IP from them). Five attempts in fifteen minutes is the confirmed
    # default; exceeding it answers 429 with a Retry-After for the rest of the
    # window.
    login_max_attempts: int = 5
    login_attempt_window_minutes: int = 15

    # The CSRF origin allow-list (F029), comma-separated full origins as a
    # browser writes them in `Origin`. Development talks to the Vite dev
    # server, which proxies /api to the backend, so the browser's origin is
    # the *frontend's* (:5173) — not the API's. Production is same-origin
    # behind Caddy, so a deployment sets this to its public origin; F060
    # validates that it is set explicitly there.
    allowed_origins: str = "http://localhost:5173"

    @property
    def trusted_origins(self) -> frozenset[str]:
        """``allowed_origins`` as a lookup set: trimmed, lowercased, slash-free."""
        return frozenset(
            origin.strip().rstrip("/").lower()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so the environment is parsed once per process."""
    return Settings()
