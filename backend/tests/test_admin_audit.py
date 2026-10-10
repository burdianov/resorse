"""The audit viewer's read API (F044).

The trail's *writing* is F043's subject; this file pins the read side against
a populated table: the fixed newest-first order with an id tiebreaker, the
filters (action/entity/search/since — escaped, validated), the pagination
math with a server total, and the fact that the item carries `details` and
`correlation_id` so the modal needs no second request.

Rows are written through the real services (never hand-inserted), because the
point is reading what the system actually records.
"""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.csrf import CSRF_HEADER_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import AuditLog, Permission, Role, User

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"
AUDIT_API = "/api/v1/admin/audit"


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


async def sign_in_with(
    client: httpx.AsyncClient, session: AsyncSession, codes: list[PermissionCode]
) -> User:
    user = await add_user(session, email="root@example.com")
    if codes:
        role = Role(name="caller-role")
        session.add(role)
        with session.no_autoflush:
            for code in codes:
                permission = await session.scalar(select(Permission).where(Permission.code == code))
                if permission is None:
                    permission = Permission(code=code)
                    session.add(permission)
                role.permissions.append(permission)
        user.roles.append(role)
    await session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "root@example.com", "password": PASSWORD},
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
    csrf = csrf_cookie.split("=", 1)[1].split(";", 1)[0]
    client.cookies.clear()
    client.cookies.update(
        {
            SESSION_COOKIE_NAME: session_cookie.split("=", 1)[1].split(";", 1)[0],
            CSRF_COOKIE_NAME: csrf,
        }
    )
    client.headers[CSRF_HEADER_NAME] = csrf
    return user


async def seed_events(client: httpx.AsyncClient, session: AsyncSession) -> None:
    """Sign in once (with both codes the tests need) and record three real
    events: two user.create, one preference.set."""
    await sign_in_with(client, session, [PermissionCode.USERS_CREATE, PermissionCode.AUDIT_READ])
    for email in ("ada@example.com", "grace@example.com"):
        created = await client.post(
            "/api/v1/admin/users", json={"email": email, "full_name": email.split("@")[0].title()}
        )
        assert created.status_code == 201, created.text
    set_pref = await client.put("/api/v1/auth/me/preferences/theme.name", json={"value": "dark"})
    assert set_pref.status_code == 200


async def test_the_viewer_requires_a_session_and_audit_read(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    assert (await client.get(AUDIT_API)).status_code == 401

    # A role without audit.read: the generic guard 403.
    await sign_in_with(client, session, [PermissionCode.USERS_READ])
    denied = await client.get(AUDIT_API)
    assert denied.status_code == 403


async def test_it_serves_newest_first_with_the_vocabulary(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await seed_events(client, session)

    response = await client.get(AUDIT_API)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 3
    actions = [item["action"] for item in body["items"]]
    assert actions == ["preference.set", "user.create", "user.create"]  # newest first
    # The filter vocabulary comes from the server's own constants (C33).
    assert "user.create" in body["actions"]
    # `file` arrived with the private storage core (F049); this set is spelled
    # out rather than compared with the constant so that widening the
    # vocabulary is a deliberate edit here too.
    assert set(body["entity_types"]) == {
        "user",
        "profile",
        "preference",
        "role",
        "permission",
        "setting",
        "file",
    }
    newest = body["items"][0]
    assert newest["details"] == {"key": "theme.name"}
    assert newest["actor_email"] == "root@example.com"


async def test_filters_narrow_exactly_and_search_is_a_term_not_a_pattern(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await seed_events(client, session)

    creates = await client.get(AUDIT_API, params={"action": "user.create"})
    assert creates.json()["total"] == 2

    entity = await client.get(AUDIT_API, params={"entity_type": "preference"})
    assert entity.json()["total"] == 1

    by_summary = await client.get(AUDIT_API, params={"search": "grace"})
    assert by_summary.json()["total"] == 1
    assert by_summary.json()["items"][0]["action"] == "user.create"

    # `%` is a character, not a wildcard (the F033 escape test, again).
    wildcard = await client.get(AUDIT_API, params={"search": "%"})
    assert wildcard.json()["total"] == 0

    unknown = await client.get(AUDIT_API, params={"action": "user.explode"})
    assert unknown.status_code == 422
    assert "user.create" in unknown.json()["detail"]  # the refusal names the vocabulary


async def test_pagination_counts_from_the_same_criteria(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await seed_events(client, session)

    first = await client.get(AUDIT_API, params={"page_size": 2})
    second = await client.get(AUDIT_API, params={"page_size": 2, "page": 2})

    assert first.json()["total"] == second.json()["total"] == 3
    assert len(first.json()["items"]) == 2
    assert len(second.json()["items"]) == 1
    ids = [item["id"] for item in first.json()["items"]] + [
        item["id"] for item in second.json()["items"]
    ]
    assert len(set(ids)) == 3  # no row appears on two pages


async def test_since_bounds_the_timeline(client: httpx.AsyncClient, session: AsyncSession) -> None:
    await seed_events(client, session)

    future = await client.get(AUDIT_API, params={"since": "2099-01-01T00:00:00Z"})
    assert future.json()["total"] == 0

    all_time = await client.get(AUDIT_API, params={"since": "2000-01-01T00:00:00Z"})
    assert all_time.json()["total"] == 3


async def test_the_item_carries_everything_the_modal_needs(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await seed_events(client, session)

    body = (await client.get(AUDIT_API, params={"action": "preference.set"})).json()
    (item,) = body["items"]
    assert set(item) == {
        "id",
        "created_at",
        "user_id",
        "actor_email",
        "action",
        "entity_type",
        "entity_id",
        "summary",
        "details",
        "correlation_id",
    }
    # Sanity: the stored row and the served row are the same record.
    stored = await session.scalar(select(AuditLog).where(AuditLog.action == "preference.set"))
    assert stored is not None
    assert str(stored.id) == item["id"]
