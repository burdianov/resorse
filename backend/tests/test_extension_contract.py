"""The extension contract, proven against real guards and a real database (F063).

BP-9.6, BP-9.7 and BP-12-P7: a test-only module registers one route, nav item,
permission, model, migration and endpoint, and is then removed from production
navigation. The module is `backend/tests/demo_records.py` (its docstring records
the three divergences a test-only module forces); the frontend half is
`frontend/tests/config/modules.test.tsx`. What is proven here:

- **The guards are the boundary.** An anonymous call is 401; a signed-in caller
  without the code is 403 and learns nothing; a holder reads and writes.
- **Isolation is in SQL.** A caller sees only their own rows, and a foreign id is
  **404, not 403** — a 403 would confirm the id exists.
- **A declaration is not authority.** A caller holding `demo_records.read` — the
  code the frontend module declares and the server registers nowhere — is refused.
- **The vocabulary is closed.** `audit.record` rejects a module event until the
  module registers it, which is a change to `AUDIT_ACTIONS`/`AUDIT_ENTITY_TYPES`
  and, for the CHECK behind them, a migration.
- **The model is migratable.** Alembic's own autogenerate sees the new table,
  which is the half of the migration step a test can hold: the revision a module
  writes by hand is `alembic revision --autogenerate` reading exactly this diff.

Everything here reaches the database, so the whole file carries `integration`
(`tests/test_markers.py` fails it in both directions).
"""

import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
import pytest_asyncio
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from demo_records import RECORD_NOT_FOUND_DETAIL, DemoRecord, router
from fastapi import FastAPI
from sqlalchemy import func, select
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import NOT_AUTHENTICATED_DETAIL, PERMISSION_DENIED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.database import Base, get_session
from app.core.security import hash_password
from app.models import Permission, Role, User
from app.models.audit import AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AuditLog
from app.services.audit import InvalidAuditEvent, record

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

EMAIL = "ada@example.com"
OTHER_EMAIL = "grace@example.com"
STRONG_PASSWORD = "correct horse battery staple"
CLIENT_IP = "203.0.113.7"


# --- helpers -----------------------------------------------------------------


async def add_user(session: AsyncSession, *, email: str = EMAIL) -> User:
    user = User(
        email=email,
        full_name="Ada Lovelace",
        hashed_password=hash_password(STRONG_PASSWORD),
        # Initialised explicitly, like every other test that appends roles after
        # the flush: touching an unloaded collection on a persistent object is a
        # lazy load, which under asyncio is a `MissingGreenlet`.
        roles=[],
    )
    session.add(user)
    await session.flush()
    return user


async def make_role(session: AsyncSession, name: str, codes: list[str]) -> Role:
    """A role holding exactly ``codes``, creating the permission rows it needs.

    The lookups run inside ``no_autoflush``: they would otherwise flush the role
    mid-build and the first append would touch a never-loaded collection (the
    `MissingGreenlet` trap `test_authorization.py` documents).
    """
    role = Role(name=name)
    session.add(role)
    with session.no_autoflush:
        for code in codes:
            permission = await session.scalar(select(Permission).where(Permission.code == code))
            if permission is None:
                permission = Permission(code=code)
                session.add(permission)
            role.permissions.append(permission)
    await session.flush()
    return role


def one_cookie(response: httpx.Response, name: str) -> str:
    matches = [h for h in response.headers.get_list("set-cookie") if h.startswith(f"{name}=")]
    assert len(matches) == 1, matches
    return matches[0]


def cookie_value(header: str) -> str:
    return header.split("=", 1)[1].split(";", 1)[0].strip('"')


def as_cookies(client: httpx.AsyncClient, cookies: dict[str, str]) -> None:
    client.cookies.clear()
    client.cookies.update(cookies)


async def sign_in(client: httpx.AsyncClient, *, email: str = EMAIL) -> dict[str, str]:
    """Logs in through the **real** app and returns the cookies to carry over."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": STRONG_PASSWORD},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200, response.text
    return {
        SESSION_COOKIE_NAME: cookie_value(one_cookie(response, SESSION_COOKIE_NAME)),
        CSRF_COOKIE_NAME: cookie_value(one_cookie(response, CSRF_COOKIE_NAME)),
    }


async def grant(session: AsyncSession, *, email: str, codes: list[str], role: str) -> User:
    """A user holding exactly ``codes``, ready to be logged in."""
    user = await add_user(session, email=email)
    user.roles.append(await make_role(session, role, codes))
    await session.flush()
    return user


async def row_count(session: AsyncSession) -> int:
    return await session.scalar(select(func.count()).select_from(DemoRecord)) or 0


def create_demo_table(sync_connection: Connection) -> None:
    """`CREATE TABLE demo_records` as the model's own DDL.

    A declarative class's `__table__` is annotated `FromClause` while at runtime it
    always *is* a `Table` — the upstream mismatch `test_database_conventions.py`
    names — and the metadata's mapping is typed as `Table`, so reading the table
    from there needs no ignore.
    """
    Base.metadata.tables["demo_records"].create(sync_connection)


# --- fixtures ----------------------------------------------------------------


@pytest_asyncio.fixture
async def extension_client(session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    """The module mounted on an app the test builds, over the module's own table.

    The shape is `test_authorization.py`'s `build_scratch_app` (F031): a fresh
    `FastAPI` carrying the module's router and the *real* guards, with
    `get_session` pointed at the test's session. The production middleware stack
    is deliberately absent — CSRF and the security headers are proven against the
    real app (`test_csrf_protection.py`, `test_production_hardening.py`), and
    nothing here depends on them.

    The table is created from the model, on this test's connection, inside the
    transaction the `session` fixture rolls back (divergence 2 of the module's
    docstring). The DDL is the model's own, so the endpoint writes to the table a
    revision would create.
    """
    connection = await session.connection()
    await connection.run_sync(create_demo_table)

    app = FastAPI()
    app.include_router(router)

    async def session_override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = session_override
    client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=(CLIENT_IP, 40301)),
        base_url="http://testserver",
    )
    try:
        yield client
    finally:
        await client.aclose()


# --- the guards --------------------------------------------------------------


async def test_an_anonymous_caller_is_refused(
    extension_client: httpx.AsyncClient,
) -> None:
    response = await extension_client.get("/records")

    assert response.status_code == 401
    assert response.json()["detail"] == NOT_AUTHENTICATED_DETAIL


async def test_a_signed_in_caller_without_the_code_is_refused_and_learns_nothing(
    client: httpx.AsyncClient,
    session: AsyncSession,
    extension_client: httpx.AsyncClient,
) -> None:
    await grant(session, email=EMAIL, codes=["files.read", "files.create"], role="reader")
    await grant(session, email=OTHER_EMAIL, codes=["users.read"], role="administrator")

    holder = await sign_in(client, email=EMAIL)
    as_cookies(extension_client, holder)
    created = await extension_client.post("/records", json={"title": "Ada’s row"})
    assert created.status_code == 201, created.text

    outsider = await sign_in(client, email=OTHER_EMAIL)
    as_cookies(extension_client, outsider)
    denied = await extension_client.get("/records")

    assert denied.status_code == 403
    assert denied.json()["detail"] == PERMISSION_DENIED_DETAIL
    # §6.2f: the denial must not become an information channel.
    assert "Ada" not in denied.text


async def test_a_write_without_the_write_code_is_refused_and_writes_nothing(
    client: httpx.AsyncClient,
    session: AsyncSession,
    extension_client: httpx.AsyncClient,
) -> None:
    await grant(session, email=EMAIL, codes=["files.read"], role="reader")

    as_cookies(extension_client, await sign_in(client, email=EMAIL))
    denied = await extension_client.post("/records", json={"title": "Not mine to write"})

    assert denied.status_code == 403
    assert denied.json()["detail"] == PERMISSION_DENIED_DETAIL
    assert await row_count(session) == 0


# --- reading and writing -----------------------------------------------------


async def test_a_holder_reads_only_their_own_rows(
    client: httpx.AsyncClient,
    session: AsyncSession,
    extension_client: httpx.AsyncClient,
) -> None:
    await grant(session, email=EMAIL, codes=["files.read", "files.create"], role="reader")
    await grant(session, email=OTHER_EMAIL, codes=["files.read", "files.create"], role="writer")

    ada = await sign_in(client, email=EMAIL)
    grace = await sign_in(client, email=OTHER_EMAIL)

    as_cookies(extension_client, ada)
    for index in (1, 2):
        created = await extension_client.post("/records", json={"title": f"Ada {index}"})
        assert created.status_code == 201, created.text

    as_cookies(extension_client, grace)
    for index in (1, 2):
        created = await extension_client.post("/records", json={"title": f"Grace {index}"})
        assert created.status_code == 201, created.text

    as_cookies(extension_client, ada)
    mine = await extension_client.get("/records")
    assert mine.status_code == 200
    assert sorted(item["title"] for item in mine.json()) == ["Ada 1", "Ada 2"]

    as_cookies(extension_client, grace)
    theirs = await extension_client.get("/records")
    assert sorted(item["title"] for item in theirs.json()) == ["Grace 1", "Grace 2"]


async def test_a_holder_writes_a_row_that_is_really_there(
    client: httpx.AsyncClient,
    session: AsyncSession,
    extension_client: httpx.AsyncClient,
) -> None:
    holder = await grant(session, email=EMAIL, codes=["files.read", "files.create"], role="reader")

    as_cookies(extension_client, await sign_in(client, email=EMAIL))
    created = await extension_client.post("/records", json={"title": "A real row"})

    assert created.status_code == 201
    assert created.json()["title"] == "A real row"
    # The endpoint committed: the row is in the database, owned by the caller, and
    # the response carries no field the caller did not ask for.
    row = await session.scalar(select(DemoRecord).where(DemoRecord.title == "A real row"))
    assert row is not None
    assert row.owner_id == holder.id
    assert set(created.json()) == {"id", "title"}


async def test_a_foreign_id_is_not_found_rather_than_forbidden(
    client: httpx.AsyncClient,
    session: AsyncSession,
    extension_client: httpx.AsyncClient,
) -> None:
    await grant(session, email=EMAIL, codes=["files.read", "files.create"], role="reader")
    await grant(session, email=OTHER_EMAIL, codes=["files.read"], role="reader-too")

    ada = await sign_in(client, email=EMAIL)
    as_cookies(extension_client, ada)
    created = await extension_client.post("/records", json={"title": "Ada’s row"})
    assert created.status_code == 201
    record_id = created.json()["id"]

    as_cookies(extension_client, await sign_in(client, email=OTHER_EMAIL))
    foreign = await extension_client.get(f"/records/{record_id}")

    assert foreign.status_code == 404
    assert foreign.json()["detail"] == RECORD_NOT_FOUND_DETAIL
    # An id that exists nowhere answers identically, so the two are
    # indistinguishable and the refusal confirms nothing.
    assert (await extension_client.get(f"/records/{uuid.uuid4()}")).status_code == 404


# --- the boundaries a module must not cross ----------------------------------


async def test_a_permission_the_frontend_declares_is_not_authority(
    client: httpx.AsyncClient,
    session: AsyncSession,
    extension_client: httpx.AsyncClient,
) -> None:
    """`demo_records.read` is the code `frontend/tests/config/demo-module.tsx`
    declares, and no server vocabulary registers it. A caller can hold it — the
    row is a `permissions` row like any other — and the guard, which demands a
    registered `PermissionCode`, still refuses. Declaring a code is not
    registering it, and the guard is the boundary."""
    await grant(session, email=EMAIL, codes=["demo_records.read"], role="declared-only")

    as_cookies(extension_client, await sign_in(client, email=EMAIL))
    response = await extension_client.get("/records")

    assert response.status_code == 403
    assert response.json()["detail"] == PERMISSION_DENIED_DETAIL


async def test_the_audit_vocabulary_is_closed_until_a_module_registers_its_event(
    session: AsyncSession,
) -> None:
    """A module's mutations must audit, and a module cannot audit an event nobody
    registered. `record` refuses it at the door — before the row is added, so the
    caller's transaction stays clean — and the refusal names the real cost of a
    new event: `AUDIT_ACTIONS`/`AUDIT_ENTITY_TYPES` plus a migration for the CHECK
    behind them."""
    actor = await add_user(session)

    assert "demo_record.create" not in AUDIT_ACTIONS
    assert "demo_record" not in AUDIT_ENTITY_TYPES

    with pytest.raises(InvalidAuditEvent):
        await record(
            session,
            actor=actor,
            action="demo_record.create",
            entity_type="demo_record",
            entity_id=None,
            summary="A module event that nobody registered.",
        )

    assert await session.scalar(select(func.count()).select_from(AuditLog)) == 0


async def test_alembic_autogenerate_sees_the_new_model(session: AsyncSession) -> None:
    """The migration half of the contract, and the reason no revision ships here.

    `migrations/env.py` points Alembic at `Base.metadata`, so a model on that
    `Base` is what `alembic revision --autogenerate` diffs against the database.
    This asserts the diff the guide's `uv run alembic revision -m "demo records"
    --rev-id 0010` would read: a new table that is not in the database yet.

    The `extension_client` fixture is deliberately not requested — it creates the
    table, and a table that exists produces no `add_table`. The other test-only
    models in this suite (`test_database_conventions.py`) are in the same
    metadata and absent from the database too, so the assertion is membership
    rather than equality: the point is that *this* model is visible, not that it
    is the only one.
    """
    connection = await session.connection()

    def diff(sync_connection: Connection) -> list[tuple[str, object]]:
        context = MigrationContext.configure(sync_connection)
        return [(str(entry[0]), entry[1]) for entry in compare_metadata(context, Base.metadata)]

    changes = await connection.run_sync(diff)
    added = {getattr(entry[1], "name", None) for entry in changes if entry[0] == "add_table"}

    assert "demo_records" in added, changes
