"""Fixtures for the database-backed tests.

BIG-PROMPT §10.2 is explicit that integration tests run against **real
PostgreSQL**, not SQLite standing in for it: the constraints under test here —
CHECK expressions, `uuidv7()` defaults, `ON DELETE CASCADE` — are PostgreSQL's,
and a stand-in would prove nothing about production.

That real database is a *separate* one. The suite connects to ``app_test``
(TEST_DATABASE_URL overrides it), creates it if missing, and migrates it to
head once per session. Development data is never touched, and — because the
whole session re-points ``DATABASE_URL`` at the test database and clears the
settings/engine caches — no code under test can reach the development database
by accident either.

Each test then runs inside a transaction that is rolled back. Sessions open
savepoints, so a test may commit and still leave nothing behind; the next test
starts from an empty schema, in a fixed order or any other.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Awaitable
from pathlib import Path
from typing import Protocol

import httpx
import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database import get_engine, get_session, get_sessionmaker

TEST_DATABASE_NAME = "app_test"
BACKEND_ROOT = Path(__file__).resolve().parents[1]


class ClientFactory(Protocol):
    """`make_client`'s return value: a builder for app clients.

    A Protocol rather than `Callable[[str], Awaitable[httpx.AsyncClient]]`
    because the peer address is **optional** — a test that does not care about
    rate-limit buckets calls it bare — and `Callable` cannot express a
    defaulted parameter: mypy reads `make_client()` against
    `Callable[[str], ...]` as "too few arguments" even though the fixture
    accepts the call.
    """

    def __call__(self, ip: str = "203.0.113.7") -> Awaitable[httpx.AsyncClient]: ...


def _test_database_url() -> str:
    """The test database URL, derived from the configured one unless overridden."""
    base = os.environ.get("TEST_DATABASE_URL") or get_settings().database_url
    if not base:
        # F056: this used to skip. A suite that reported every database test as
        # skipped and still exited 0 is not a gate — it is a green light with
        # nothing behind it. The database-free leg is `-m "not integration"`.
        pytest.fail(
            "No PostgreSQL is configured (DATABASE_URL or TEST_DATABASE_URL), so "
            'the integration leg cannot run: use `-m "not integration"` for the '
            "database-free leg, and run this one where a database is reachable "
            "(see .env.example).",
            pytrace=False,
        )
    return make_url(base).set(database=TEST_DATABASE_NAME).render_as_string(hide_password=False)


async def _create_database_if_missing(test_url: str) -> None:
    """Connect to the maintenance database and create the test one.

    `CREATE DATABASE` cannot run inside a transaction, hence AUTOCOMMIT.
    """
    maintenance_url = make_url(test_url).set(database="postgres")
    engine = create_async_engine(maintenance_url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as connection:
            exists = await connection.scalar(
                text("select 1 from pg_database where datname = :name"),
                {"name": TEST_DATABASE_NAME},
            )
            if not exists:
                # The name is a constant in this module, never user input.
                await connection.execute(text(f'CREATE DATABASE "{TEST_DATABASE_NAME}"'))
    finally:
        await engine.dispose()


def _migrate_to_head() -> None:
    """Apply every revision to the test database (Alembic's own CLI path)."""
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def test_database_url() -> str:
    """Create (if needed) and migrate the test database; hand back its URL.

    Session-scoped and deliberately sync: the migration is a subprocess-shaped
    operation and pytest-asyncio's loop scopes would only complicate it.
    """
    test_url = _test_database_url()
    asyncio.run(_create_database_if_missing(test_url))

    # Point the application at the test database for the rest of the session.
    # Clearing the caches matters: both are lru_cache'd singletons.
    os.environ["DATABASE_URL"] = test_url
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_sessionmaker.cache_clear()

    _migrate_to_head()
    return test_url


# `pytest_asyncio.fixture`, not `pytest.fixture`: in strict mode pytest-asyncio
# only wraps fixtures it is asked to, and a plain async fixture is reported as
# "no plugin or hook that handled it".
@pytest_asyncio.fixture
async def session(test_database_url: str) -> AsyncIterator[AsyncSession]:
    """A session whose work disappears when the test ends."""
    engine = create_async_engine(test_database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            maker = async_sessionmaker(
                bind=connection,
                expire_on_commit=False,
                # A test may commit; the savepoint keeps the outer transaction —
                # and therefore the rollback — intact.
                join_transaction_mode="create_savepoint",
            )
            async with maker() as session:
                yield session
            await transaction.rollback()
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def make_client(
    session: AsyncSession,
) -> AsyncIterator[ClientFactory]:
    """Builders for app clients, each pretending to be a distinct peer address.

    The API is exercised through the real FastAPI application over httpx's
    ASGI transport — nothing about the request path is stubbed; only the
    request-scoped database session is redirected (dependency override) onto
    the rollback fixture, so a session a request committed is visible to the
    test. Rate limiting counts per address, so a test that needs a fresh IP
    budget opens its own client; every client shares the one session.
    """
    from app.main import app

    async def session_override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = session_override
    opened: list[httpx.AsyncClient] = []

    async def make(ip: str = "203.0.113.7") -> httpx.AsyncClient:
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, client=(ip, 40301)),
            base_url="http://testserver",
        )
        opened.append(client)
        return client

    try:
        yield make
    finally:
        for client in opened:
            await client.aclose()
        app.dependency_overrides.pop(get_session, None)


@pytest_asyncio.fixture
async def client(
    make_client: ClientFactory,
) -> httpx.AsyncClient:
    return await make_client()
