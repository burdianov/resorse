"""Own-profile editing and per-user preferences (F041).

The acceptance is "cross-user access denied", and the file proves it the way
the design promises: two real users, the same preference key, different
values — each session reads and writes only its own row, and the *service has
no parameter* through which the other user's id could arrive (the id is
always the session's). The strongest assertions are therefore behavioural:
A's snapshot is byte-identical before and after B's write.

The second pinned property is the gating split (C30): `GET /auth/me` stays
reachable during a forced password change (the SPA reads the flag there),
while `PATCH /auth/me` and every preferences endpoint take the gate — they
are regular mutations.
"""

import httpx
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import PASSWORD_CHANGE_REQUIRED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.csrf import CSRF_HEADER_NAME
from app.core.security import hash_password
from app.models import User, UserPreference

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"
PREFS_API = "/api/v1/auth/me/preferences"


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


async def sign_in(client: httpx.AsyncClient, session: AsyncSession, email: str) -> tuple[str, str]:
    """Authenticate and adopt the session on the client; returns (token, csrf)."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
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
    token = session_cookie.split("=", 1)[1].split(";", 1)[0]
    csrf = csrf_cookie.split("=", 1)[1].split(";", 1)[0]
    client.cookies.clear()
    client.cookies.update({SESSION_COOKIE_NAME: token, CSRF_COOKIE_NAME: csrf})
    client.headers[CSRF_HEADER_NAME] = csrf
    return token, csrf


async def test_every_endpoint_requires_a_session(client: httpx.AsyncClient) -> None:
    replies = [
        await client.get(PREFS_API),
        await client.put(f"{PREFS_API}/table.rows", json={"value": 10}),
        await client.delete(f"{PREFS_API}/table.rows"),
        await client.patch("/api/v1/auth/me", json={"full_name": "X"}),
    ]
    for response in replies:
        assert response.status_code == 401, response.text


async def test_regular_endpoints_sit_behind_the_forced_change_gate(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session, email="pending@example.com", must_change_password=True)
    await session.commit()
    await sign_in(client, session, "pending@example.com")

    # The GET stays reachable — it is how the SPA learns the flag is set.
    assert (await client.get("/api/v1/auth/me")).status_code == 200

    # Everything else is a regular endpoint and takes the gate (C30).
    replies = [
        await client.patch("/api/v1/auth/me", json={"full_name": "X"}),
        await client.get(PREFS_API),
        await client.put(f"{PREFS_API}/table.rows", json={"value": 10}),
        await client.delete(f"{PREFS_API}/table.rows"),
    ]
    for response in replies:
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == PASSWORD_CHANGE_REQUIRED_DETAIL


async def test_patch_me_edits_owned_fields_only(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await add_user(session, email="ada@example.com")
    await session.commit()
    await sign_in(client, session, "ada@example.com")

    updated = await client.patch(
        "/api/v1/auth/me", json={"full_name": "  Ada Lovelace  ", "phone": "+971 50 000 0000"}
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["full_name"] == "Ada Lovelace"  # trimmed
    assert body["phone"] == "+971 50 000 0000"
    assert body["permissions"] == []  # the full MeResponse shape

    cleared = await client.patch("/api/v1/auth/me", json={"phone": None})
    assert cleared.status_code == 200
    assert cleared.json()["phone"] is None

    empty = await client.patch("/api/v1/auth/me", json={})
    assert empty.status_code == 400

    # Email is admin-managed: the schema forbids the field outright rather
    # than accepting and ignoring it (extra="forbid").
    refused = await client.patch("/api/v1/auth/me", json={"email": "new@example.com"})
    assert refused.status_code == 422
    refreshed = await session.scalar(
        select(User).where(User.id == user.id).execution_options(populate_existing=True)
    )
    assert refreshed is not None and refreshed.email == "ada@example.com"


# --- preferences -----------------------------------------------------------------


async def test_preference_crud_round_trips_and_replaces(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session, email="ada@example.com")
    await session.commit()
    await sign_in(client, session, "ada@example.com")

    assert (await client.get(PREFS_API)).json() == {"items": []}

    created = await client.put(f"{PREFS_API}/table.rows", json={"value": 25})
    assert created.status_code == 200, created.text
    assert created.json() == {"key": "table.rows", "value": 25}

    replaced = await client.put(f"{PREFS_API}/table.rows", json={"value": 50})
    assert replaced.status_code == 200
    listing = await client.get(PREFS_API)
    assert listing.json()["items"] == [{"key": "table.rows", "value": 50}]
    # Upsert, not append: one row carries the pair.
    assert await session.scalar(select(func.count()).select_from(UserPreference)) == 1

    removed = await client.delete(f"{PREFS_API}/table.rows")
    assert removed.status_code == 204
    # Idempotent: the goal state holds, so the answer does not change.
    assert (await client.delete(f"{PREFS_API}/table.rows")).status_code == 204
    assert (await client.get(PREFS_API)).json() == {"items": []}


async def test_preferences_accept_the_json_shapes_they_will_hold(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session, email="ada@example.com")
    await session.commit()
    await sign_in(client, session, "ada@example.com")

    values = {
        "theme.name": "dark",
        "table.order": ["email", "full_name"],
        "table.rows": 25,
        "notifications.display": {"sound": False, "badge": True},
    }
    for key, value in values.items():
        response = await client.put(f"{PREFS_API}/{key}", json={"value": value})
        assert response.status_code == 200, (key, response.text)

    items = {item["key"]: item["value"] for item in (await client.get(PREFS_API)).json()["items"]}
    assert items == values


async def test_preference_keys_and_values_are_guarded(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session, email="ada@example.com")
    await session.commit()
    await sign_in(client, session, "ada@example.com")

    for bad_key in ("BadKey", "has space", "a" * 101):
        refused = await client.put(f"{PREFS_API}/{bad_key}", json={"value": 1})
        assert refused.status_code == 422, bad_key
        assert refused.json()["detail"][0]["loc"] == ["path", "key"]

    nulled = await client.put(f"{PREFS_API}/theme.name", json={"value": None})
    assert nulled.status_code == 422

    oversized = await client.put(f"{PREFS_API}/theme.name", json={"value": "x" * 9000})
    assert oversized.status_code == 422

    assert await session.scalar(select(func.count()).select_from(UserPreference)) == 0


# --- the acceptance: cross-user access is denied --------------------------------


async def test_one_users_preferences_are_invisible_and_untouchable_to_another(
    make_client, session: AsyncSession
) -> None:
    await add_user(session, email="ada@example.com")
    await add_user(session, email="grace@example.com")
    await session.commit()

    ada_client = await make_client("192.0.2.71")
    grace_client = await make_client("192.0.2.72")
    await sign_in(ada_client, session, "ada@example.com")
    await sign_in(grace_client, session, "grace@example.com")

    await ada_client.put(f"{PREFS_API}/table.rows", json={"value": 10})
    grace_before = (await grace_client.get(PREFS_API)).json()
    assert grace_before == {"items": []}  # Grace sees her own (empty) list, not Ada's

    # Grace writes the SAME key with a different value: Ada's row is untouched.
    await grace_client.put(f"{PREFS_API}/table.rows", json={"value": 99})
    assert (await ada_client.get(PREFS_API)).json() == {
        "items": [{"key": "table.rows", "value": 10}]
    }
    assert (await grace_client.get(PREFS_API)).json() == {
        "items": [{"key": "table.rows", "value": 99}]
    }

    # And Grace's DELETE of the shared key removes only her own row.
    await grace_client.delete(f"{PREFS_API}/table.rows")
    assert (await ada_client.get(PREFS_API)).json() == {
        "items": [{"key": "table.rows", "value": 10}]
    }

    # Two rows existed side by side under the same key — the isolation is the
    # composite (user_id, key), queried by the session's id, not a filter.
    rows = list(await session.scalars(select(UserPreference)))
    assert [row.key for row in rows] == ["table.rows"]


async def test_deleting_a_user_takes_their_preferences(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await add_user(session, email="ada@example.com")
    await session.commit()
    await sign_in(client, session, "ada@example.com")
    await client.put(f"{PREFS_API}/theme.name", json={"value": "dark"})
    assert await session.scalar(select(func.count()).select_from(UserPreference)) == 1

    # The hard delete path (a soft delete keeps the row, F024): personal
    # display data has no audit value, so CASCADE is the right edge.
    await session.execute(delete(User).where(User.id == user.id))

    assert await session.scalar(select(func.count()).select_from(UserPreference)) == 0
