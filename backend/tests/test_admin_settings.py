"""Application settings — the registry, the snapshot, and restart persistence (F039).

The acceptance is "Restart persistence tests", so persistence is proven twice:
against the shared rollback session (expunge everything, re-read through the
API — the value lives in the row, not in process memory) and against **its own
connection** (write through one engine, close it, read through another — the
closest a test can get to a process restart). The own-connection rows are
cleaned in a ``finally``; everything else rides the session fixture.

The rest of the file pins the guardrails: the registry is the allowlist
(unknown keys 422 before anything is written), values are validated per type,
and a failed payload writes **nothing** — F035's validate-everything-first
discipline, in miniature.
"""

from collections.abc import AsyncIterator

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1.dependencies import PERMISSION_DENIED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.csrf import CSRF_HEADER_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.core.settings_registry import defaults
from app.models import AppSetting, Permission, Role, User

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"
SETTINGS_API = "/api/v1/admin/settings"


async def add_user(session: AsyncSession, *, email: str, **overrides: object) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0].title(),
        hashed_password=hash_password(PASSWORD),
        roles=[],
        **overrides,  # type: ignore[arg-type]
    )
    session.add(user)
    await session.flush()
    return user


async def make_role(session: AsyncSession, name: str, codes: list[PermissionCode]) -> Role:
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


async def sign_in_with(
    client: httpx.AsyncClient, session: AsyncSession, codes: list[PermissionCode]
) -> User:
    user = await add_user(session, email="admin@example.com")
    if codes:
        user.roles.append(await make_role(session, "caller-role", codes))
    await session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": PASSWORD},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200, response.text
    session_cookie = next(
        header
        for header in response.headers.get_list("set-cookie")
        if header.startswith(f"{SESSION_COOKIE_NAME}=")
    )
    csrf_cookie = next(
        header
        for header in response.headers.get_list("set-cookie")
        if header.startswith(f"{CSRF_COOKIE_NAME}=")
    )
    client.cookies.clear()
    client.cookies.update(
        {
            SESSION_COOKIE_NAME: session_cookie.split("=", 1)[1].split(";", 1)[0],
            CSRF_COOKIE_NAME: csrf_cookie.split("=", 1)[1].split(";", 1)[0],
        }
    )
    client.headers[CSRF_HEADER_NAME] = csrf_cookie.split("=", 1)[1].split(";", 1)[0]
    return user


def all_codes() -> list[PermissionCode]:
    return [PermissionCode.SETTINGS_READ, PermissionCode.SETTINGS_MANAGE]


# --- guards and the snapshot ----------------------------------------------------


async def test_settings_require_a_session_and_the_right_codes(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    assert (await client.get(SETTINGS_API)).status_code == 401
    assert (await client.put(SETTINGS_API, json={"branding.app_name": "X"})).status_code == 401

    # settings.read only: reading works, writing is the generic guard 403.
    await sign_in_with(client, session, [PermissionCode.SETTINGS_READ])
    assert (await client.get(SETTINGS_API)).status_code == 200
    denied = await client.put(SETTINGS_API, json={"branding.app_name": "X"})
    assert denied.status_code == 403
    assert denied.json()["detail"] == PERMISSION_DENIED_DETAIL


async def test_the_snapshot_serves_registry_defaults_without_any_rows(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, all_codes())

    response = await client.get(SETTINGS_API)

    assert response.status_code == 200, response.text
    assert response.json()["values"] == defaults()
    assert await session.scalar(select(func.count()).select_from(AppSetting)) == 0


# --- the guarded write ----------------------------------------------------------


async def test_a_failed_payload_writes_nothing(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, all_codes())

    # An unknown key: refused at the key, before anything is stored.
    unknown = await client.put(
        SETTINGS_API, json={"branding.app_name": "Fine", "nope.key": "value"}
    )
    assert unknown.status_code == 422
    (entry,) = unknown.json()["detail"]
    assert entry["loc"] == ["body", "nope.key"]
    assert "Unknown setting" in entry["msg"]

    # A bad value of the right type…
    bad_format = await client.put(SETTINGS_API, json={"display.date_format": "31/12/2026"})
    assert bad_format.status_code == 422
    assert bad_format.json()["detail"][0]["loc"] == ["body", "display.date_format"]

    # …and a wrong JSON type.
    wrong_type = await client.put(SETTINGS_API, json={"branding.app_name": 123})
    assert wrong_type.status_code == 422
    assert wrong_type.json()["detail"][0]["loc"] == ["body", "branding.app_name"]

    # The first payload was mostly valid — and still wrote nothing (validate
    # everything before the first write, F035's discipline).
    assert await session.scalar(select(func.count()).select_from(AppSetting)) == 0


async def test_put_stores_overrides_and_returns_the_snapshot(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    caller = await sign_in_with(client, session, all_codes())

    response = await client.put(
        SETTINGS_API,
        json={"branding.app_name": "  Acme Manpower  ", "display.date_format": "YYYY-MM-DD"},
    )

    assert response.status_code == 200, response.text
    values = response.json()["values"]
    assert values["branding.app_name"] == "Acme Manpower"  # trimmed
    assert values["display.date_format"] == "YYYY-MM-DD"
    assert values["display.timezone"] == defaults()["display.timezone"]  # untouched default

    rows = {row.key: row for row in await session.scalars(select(AppSetting))}
    assert set(rows) == {"branding.app_name", "display.date_format"}
    assert rows["branding.app_name"].value == "Acme Manpower"
    assert rows["branding.app_name"].updated_by == caller.id
    assert rows["branding.app_name"].updated_at is not None


async def test_partial_updates_leave_other_overrides_alone(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, all_codes())

    await client.put(SETTINGS_API, json={"branding.app_name": "Acme"})
    response = await client.put(SETTINGS_API, json={"display.timezone": "UTC"})

    assert response.status_code == 200
    assert response.json()["values"]["branding.app_name"] == "Acme"
    assert response.json()["values"]["display.timezone"] == "UTC"
    assert await session.scalar(select(func.count()).select_from(AppSetting)) == 2


async def test_updated_by_becomes_null_when_the_author_is_deleted(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    caller = await sign_in_with(client, session, all_codes())
    await client.put(SETTINGS_API, json={"branding.app_name": "Acme"})

    await session.execute(delete(User).where(User.id == caller.id))

    row = await session.scalar(
        select(AppSetting)
        .where(AppSetting.key == "branding.app_name")
        .execution_options(populate_existing=True)
    )
    assert row is not None
    # Attribution, not ownership: the setting outlives its last editor.
    assert row.updated_by is None


# --- restart persistence --------------------------------------------------------


async def test_overrides_survive_losing_all_in_memory_state(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """Part one: drop every cached object, read through the API again — the
    snapshot must come from the rows, not from anything the process holds."""
    await sign_in_with(client, session, all_codes())
    await client.put(SETTINGS_API, json={"branding.app_name": "Acme"})

    session.expunge_all()
    response = await client.get(SETTINGS_API)

    assert response.status_code == 200
    assert response.json()["values"]["branding.app_name"] == "Acme"


@pytest_asyncio.fixture
async def own_database(test_database_url: str) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Sessions on their **own** connections, for the restart proof.

    The shared fixture session lives inside one rolled-back transaction; a
    second connection cannot see its work, and vice versa. This fixture hands
    out a maker on a separate engine so the test can genuinely commit, close
    everything, and reopen — the closest thing to a process restart.
    """
    engine = create_async_engine(test_database_url)
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def test_overrides_survive_a_connection_level_restart(
    own_database: async_sessionmaker[AsyncSession],
) -> None:
    """Part two: write through one session, close it, read through a brand
    new one — a real commit against the real database."""
    from app.services.settings import get_settings_snapshot, update_settings

    written_keys = ["display.timezone", "branding.app_description"]
    try:
        async with own_database() as writer:
            actor = User(
                email="restart-actor@example.com",
                full_name="Restart Actor",
                hashed_password=hash_password(PASSWORD),
                roles=[],
            )
            writer.add(actor)
            await writer.flush()
            await update_settings(
                writer,
                actor=actor,
                values={"display.timezone": "UTC", "branding.app_description": "Restart proof"},
            )
        # The writer session is closed and its connection returned.

        async with own_database() as reader:
            snapshot = await get_settings_snapshot(reader)
        assert snapshot["display.timezone"] == "UTC"
        assert snapshot["branding.app_description"] == "Restart proof"

        # And the untouched keys still read as their registry defaults.
        assert snapshot["display.date_format"] == defaults()["display.date_format"]
    finally:
        async with own_database() as cleaner:
            await cleaner.execute(delete(AppSetting).where(AppSetting.key.in_(written_keys)))
            await cleaner.execute(delete(User).where(User.email == "restart-actor@example.com"))
            await cleaner.commit()
