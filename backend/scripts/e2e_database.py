"""The browser-test database: fresh, migrated, and nothing like the dev one (F057).

BP-10.4 asks for Playwright "against real API + freshly migrated real Postgres,
seeded with generated test credentials only in isolated test configuration".
This script is the "freshly migrated" and the "isolated" half of that sentence;
`frontend/playwright.config.ts` is the half that starts the servers.

What it does, in order:

1. Resolves the E2E database URL — ``E2E_DATABASE_URL`` if set, otherwise the
   configured ``DATABASE_URL`` with the database name replaced by ``app_e2e``.
2. **Drops and recreates** that database, then migrates it to head. A run
   starts from an empty schema, so the workflow's first step (bootstrap the
   super-admin) is genuinely a first run rather than a re-run against last
   session's users.
3. Creates the super-admin through ``bootstrap_super_admin`` — the same
   transactional core the operator's CLI uses — with a password generated here,
   plus filler accounts so the users table has more rows than one page.
4. Writes the credentials the specs need to the state file Playwright passes in.

**Two guards, because this file drops a database.** The name is always required
to end in ``_e2e``, and it is refused outright if it equals the configured
``DATABASE_URL``'s — so the worst a mistyped argument can do is delete another
E2E database, never ``app_dev``. The name is also refused unless it is a plain
identifier, since it is interpolated into DDL that cannot take a bind
parameter.

Passwords are generated per run and shown to nobody: they reach the browser
specs through the state file (git-ignored), never through ``.env``, the console
or a committed artefact. Nothing here reads ``LOCAL_CREDENTIALS.md``.

Usage (from ``backend/``):

    uv run python -m scripts.e2e_database --print-url         # resolve, no side effects
    uv run python -m scripts.e2e_database --state-file PATH   # reset + bootstrap

``playwright.config.ts`` calls both: the first at config load (it needs the URL
to hand the API server), the second inside the API server's start command, so
the database is ready before uvicorn connects to it.
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.bootstrap_admin import bootstrap_super_admin
from app.core.config import get_settings
from app.core.database import get_engine, get_sessionmaker
from app.core.security import generate_password
from app.models.identity import User
from app.services import users as users_service

BACKEND_ROOT = Path(__file__).resolve().parent.parent

E2E_DATABASE_NAME = "app_e2e"
# The API's email validation refuses the reserved testing TLDs (`.test`,
# `.invalid`, `.example` — "a special-use or reserved name that cannot be used
# with email"), so the addresses are ordinary-looking ones on a domain nothing
# sends mail to. `.test` here would make every account a 422.
E2E_EMAIL_DOMAIN = "resors-e2e.com"
E2E_ADMIN_EMAIL = f"e2e-admin@{E2E_EMAIL_DOMAIN}"
E2E_ADMIN_FULL_NAME = "E2E Administrator"
# The users list is server-paginated at 25 rows (F033/C23), so the table has a
# second page only if there are more accounts than that. Created through the
# service, so every filler row carries the audit entry a real creation would.
E2E_FILLER_USERS = 27


class Refused(Exception):
    """The requested database is not a safe one to drop."""


def e2e_database_url() -> str:
    """The isolated database URL, or a refusal explaining what is missing."""
    configured = get_settings().database_url
    override = os.environ.get("E2E_DATABASE_URL", "").strip()
    base = override or configured
    if not base:
        raise Refused(
            "No E2E_DATABASE_URL and no DATABASE_URL: the browser tests need a "
            "PostgreSQL to build their own database on (see .env.example).",
        )
    url = make_url(base)
    if not override:
        return url.set(database=E2E_DATABASE_NAME).render_as_string(hide_password=False)

    name = url.database or ""
    configured_name = make_url(configured).database if configured else None
    if name != E2E_DATABASE_NAME and not name.endswith("_e2e"):
        raise Refused(
            f"E2E_DATABASE_URL names {name!r}: an E2E database is named "
            f"{E2E_DATABASE_NAME} or ends in '_e2e'. Refusing rather than "
            "dropping something a browser test has no business dropping.",
        )
    if configured_name is not None and name == configured_name:
        raise Refused(
            f"E2E_DATABASE_URL names {name!r}, the configured DATABASE_URL "
            "database. Refusing: the E2E run drops and recreates its database.",
        )
    return url.render_as_string(hide_password=False)


def _checked_name(url: str) -> str:
    """The database name to drop, proven safe to interpolate into DDL."""
    name = make_url(url).database or ""
    if name != E2E_DATABASE_NAME and not name.endswith("_e2e"):
        raise Refused(f"Refusing to drop {name!r}: an E2E database ends in '_e2e'.")
    if not name.isidentifier():
        raise Refused(f"Refusing to drop {name!r}: not a plain identifier.")
    return name


async def _recreate(url: str, name: str) -> None:
    """DROP and CREATE the database, from the maintenance connection.

    ``WITH (FORCE)`` disconnects whatever the previous run left attached;
    without it a stray session from an interrupted run makes this refuse with a
    message about other users rather than doing its job. Neither statement can
    run inside a transaction, hence AUTOCOMMIT.
    """
    maintenance = make_url(url).set(database="postgres")
    engine = create_async_engine(maintenance, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as connection:
            await connection.exec_driver_sql(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            await connection.exec_driver_sql(f'CREATE DATABASE "{name}"')
    finally:
        await engine.dispose()


def _migrate_to_head(url: str) -> None:
    """Apply every revision to the E2E database, through Alembic's own CLI path.

    ``DATABASE_URL`` is set in the environment first: that is how ``env.py``
    and ``app.core.config`` both learn which database they are migrating — the
    same mechanism ``tests/conftest.py`` uses, and the reason this run cannot
    reach the development database once this line has executed.
    """
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_sessionmaker.cache_clear()
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    command.upgrade(config, "head")


async def _seed_accounts(url: str, password: str) -> None:
    """Bootstrap the super-admin, then fill the directory out to a second page."""
    engine = create_async_engine(url)
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    try:
        async with maker() as session:
            await bootstrap_super_admin(
                session,
                email=E2E_ADMIN_EMAIL,
                password=password,
                full_name=E2E_ADMIN_FULL_NAME,
            )
            await session.commit()

        # The filler accounts exist so the users table paginates; they carry no
        # roles (the workflow's own step 3 is what assigns those) and their
        # passwords are generated and discarded — nothing logs in as them.
        async with maker() as session:
            admin = await session.scalar(select(User).where(User.email == E2E_ADMIN_EMAIL))
            if admin is None:  # the bootstrap just created it
                raise Refused(f"bootstrap created no {E2E_ADMIN_EMAIL} account")
            for index in range(1, E2E_FILLER_USERS + 1):
                await users_service.create_user(
                    session,
                    actor=admin,
                    email=f"e2e-filler-{index:02d}@{E2E_EMAIL_DOMAIN}",
                    full_name=f"E2E Filler {index:02d}",
                    phone=None,
                    role_ids=[],
                    is_superuser=False,
                    password=password,
                )
    finally:
        await engine.dispose()


def _write_state(path: Path, password: str) -> None:
    """Hand the specs what only this process can know.

    The file lives under the frontend's ignored `.state/` directory: it holds a
    per-run credential for an isolated database, and it must never be committed
    or read by anything but the E2E run.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    state = {
        "adminEmail": E2E_ADMIN_EMAIL,
        "adminPassword": password,
        "databaseName": E2E_DATABASE_NAME,
        "preparedAt": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8", newline="")


def reset(url: str, state_file: Path) -> None:
    """Recreate, migrate and seed the E2E database; then write `state_file`."""
    name = _checked_name(url)
    password = generate_password()
    asyncio.run(_recreate(url, name))
    _migrate_to_head(url)
    asyncio.run(_seed_accounts(url, password))
    _write_state(state_file, password)
    print(f"prepared {name}: {E2E_ADMIN_EMAIL} plus {E2E_FILLER_USERS} filler accounts")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.e2e_database",
        description="Prepare (or merely locate) the isolated browser-test database.",
    )
    parser.add_argument(
        "--print-url",
        action="store_true",
        help="print the E2E database URL and exit, touching nothing",
    )
    parser.add_argument(
        "--state-file",
        type=Path,
        help="where to write the generated credentials (required when resetting)",
    )
    args = parser.parse_args(argv)

    try:
        url = e2e_database_url()
    except Refused as refusal:
        print(f"E2E database refused: {refusal}", file=sys.stderr)
        return 1

    if args.print_url:
        print(url)
        return 0

    if args.state_file is None:
        parser.error("--state-file is required unless --print-url is given")
    try:
        reset(url, args.state_file)
    except Refused as refusal:
        print(f"E2E database refused: {refusal}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
