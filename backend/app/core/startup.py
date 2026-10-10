"""Production startup validation (F060; BIG-PROMPT §11.5, BP-6.4).

A production process refuses to start on configuration that would be unsafe
rather than merely unhelpful: a placeholder or weak database password, an
origin list nobody chose, an upload or converter address left at its
development default. The checks are pure functions of :class:`Settings`, so
the rules are tested without a process, and :func:`create_app` is the one
caller that turns a finding into a refusal.

"Explicitly set" is read from ``Settings.model_fields_set``: a value that is
only the development default does not count, even when it happens to be
usable on a laptop. Development and test environments are never checked.
"""

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.core.config import Settings

MIN_DATABASE_PASSWORD_LENGTH = 16

# Fragments the shipped `.env.example` and the operator docs use as stand-ins.
# A credential containing one was copied, not generated.
PLACEHOLDER_FRAGMENTS = ("replace-with", "changeme", "change-me", "example")

# Passwords that are weak whatever their length, because they are the defaults
# every database image and tutorial reaches for first.
WEAK_DATABASE_PASSWORDS = frozenset({"app", "postgres", "password", "secret", "resors"})


class ProductionConfigError(RuntimeError):
    """Raised at startup when production configuration is not acceptable."""


def _database_problems(settings: Settings) -> list[str]:
    if not settings.database_url:
        return ["DATABASE_URL is not set."]
    problems: list[str] = []
    lowered = settings.database_url.lower()
    if any(fragment in lowered for fragment in PLACEHOLDER_FRAGMENTS):
        problems.append("DATABASE_URL contains a placeholder; replace it with real credentials.")
    try:
        password = make_url(settings.database_url).password
    except ArgumentError:
        # The URL itself is not echoed: it carries the password.
        return [*problems, "DATABASE_URL is not a valid database URL."]
    if not password:
        problems.append("DATABASE_URL carries no password.")
    elif password.lower() in WEAK_DATABASE_PASSWORDS:
        problems.append("The database password is a well-known default.")
    elif len(password) < MIN_DATABASE_PASSWORD_LENGTH:
        problems.append(
            f"The database password is shorter than {MIN_DATABASE_PASSWORD_LENGTH} characters."
        )
    return problems


def _origin_problems(settings: Settings) -> list[str]:
    if "allowed_origins" not in settings.model_fields_set:
        return ["ALLOWED_ORIGINS must be set explicitly to the public origin."]
    origins = settings.trusted_origins
    if not origins:
        return ["ALLOWED_ORIGINS is empty."]
    problems: list[str] = []
    for origin in sorted(origins):
        if not origin.startswith("https://"):
            problems.append(f"ALLOWED_ORIGINS entry {origin!r} is not an https origin.")
        if any(local in origin for local in ("localhost", "127.0.0.1", "[::1]")):
            problems.append(f"ALLOWED_ORIGINS entry {origin!r} is a loopback address.")
        if origin in {"*", "null"}:
            problems.append(f"ALLOWED_ORIGINS entry {origin!r} is not an origin.")
    return problems


def _explicit_problems(settings: Settings) -> list[str]:
    problems: list[str] = []
    if "storage_root" not in settings.model_fields_set:
        problems.append("STORAGE_ROOT must be set to the mounted uploads volume.")
    if "gotenberg_url" not in settings.model_fields_set or "localhost" in settings.gotenberg_url:
        problems.append("GOTENBERG_URL must name the converter service, not localhost.")
    return problems


def production_problems(settings: Settings) -> list[str]:
    """Every reason this configuration must not run in production; empty if none.

    Messages name the setting and the rule, never a value: a finding is written
    to logs and to the operator's terminal, and a secret must not be echoed there.
    """
    if not settings.is_production:
        return []
    return [
        *_database_problems(settings),
        *_origin_problems(settings),
        *_explicit_problems(settings),
    ]


def assert_production_ready(settings: Settings) -> None:
    """Refuse to start (raise) when :func:`production_problems` finds anything."""
    problems = production_problems(settings)
    if problems:
        listed = "\n".join(f"  - {problem}" for problem in problems)
        raise ProductionConfigError(f"Refusing to start in production:\n{listed}")
