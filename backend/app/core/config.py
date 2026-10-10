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
#
# The repository root is also where relative *runtime paths* resolve from (the
# storage root below), for the same reason: a path that depends on the working
# directory is a path that differs between two ways of starting the same app.
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = REPOSITORY_ROOT / ".env"

# The MIME types a generic upload may be, unless a deployment says otherwise
# (F049; BP-6.4 "MIME + magic-byte checking"). Every entry has a real signature
# check behind it in `app/services/storage.py` — a type that cannot be verified
# from the bytes does not belong on the list, because the allowlist is only
# worth what the *sniffer* can establish on its own.
#
# `text/plain` and `text/csv` are the same sniffed family (a payload that is
# valid UTF-8 and not markup); the declared type may pick between them, which is
# the one place a client's word is taken — and it can only ever refine within
# that family, never widen it.
DEFAULT_ALLOWED_CONTENT_TYPES = (
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "text/csv",
    "text/plain",
)


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

    # The private file volume (F049; BP-6.4 "no public uploads volume", §7.9).
    # The default sits under the repository's `/data/` tree, which .gitignore
    # already excludes as runtime data — so an object written by a development
    # upload can never be committed by accident. A deployment points this at a
    # mounted volume; nothing in the application ever serves the directory, and
    # nothing constructs a path inside it except `app/services/storage.py`,
    # which addresses objects by UUID key and refuses anything else.
    storage_root: Path = REPOSITORY_ROOT / "data" / "uploads"
    # Per-file cap (BP-6.4 "body/upload caps"). 10 MiB is comfortably above the
    # documents this library holds and far below anything that would make a
    # single request a denial-of-service.
    storage_max_upload_bytes: int = 10 * 1024 * 1024
    # The MIME allowlist, comma-separated like `allowed_origins` above. It is
    # configuration, not policy baked into code: a deployment that does not want
    # spreadsheets removes one entry.
    storage_allowed_content_types: str = ",".join(DEFAULT_ALLOWED_CONTENT_TYPES)

    @property
    def trusted_origins(self) -> frozenset[str]:
        """``allowed_origins`` as a lookup set: trimmed, lowercased, slash-free."""
        return frozenset(
            origin.strip().rstrip("/").lower()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        )

    @property
    def allowed_content_types(self) -> frozenset[str]:
        """``storage_allowed_content_types`` as a lookup set, parameter-free.

        A type arrives with parameters far more often than without one
        (``text/plain; charset=utf-8``), so the entries are compared on the type
        alone — the part before the first ``;``.
        """
        return frozenset(
            entry.split(";")[0].strip().lower()
            for entry in self.storage_allowed_content_types.split(",")
            if entry.strip()
        )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so the environment is parsed once per process."""
    return Settings()
