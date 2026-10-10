"""Authorization: the permission union and the server-side dependencies (F031).

Two kinds of surface, deliberately:

- **The real app** for everything that exists there — login, the forced-change
  flow, ``GET /auth/me``. The union is asserted through the endpoint the
  frontend actually consumes, not through a helper.
- **A scratch app** (``build_scratch_app``) for the dependencies themselves:
  ``require_permission(...)`` and the ``must_change_password`` gate need
  endpoints to guard, and this project does not ship placeholder production
  routes to have something to test against. The scratch app mounts the real
  dependencies over the real database session — the same objects a future
  F033 endpoint will compose, just registered on a throwaway FastAPI instance.

What is pinned, in the order the requirements name it:

- **The union** (BP-0.8): access granted by *either* of a user's roles, a
  code held by two roles appearing once, and the superuser expansion.
- **Per-request re-evaluation** (BP-6.3f): a role removed in the database
  denies the *same cookie* on the next request — the test expires every
  cached object first, so it proves the re-read, not the identity map.
- **Fail closed** (BP-6.3c): no session → 401; no permission → 403 with one
  generic message and the endpoint body never running; deactivated user → 401
  everywhere.
- **The forced-change gate** (BP-6.1e): regular endpoints answer 403 while
  ``must_change_password`` is set — the flag check fires *before* the
  permission check — while the auth endpoints stay reachable, and completing
  the change lifts the gate on the very next request.
"""

from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated

import httpx
import pytest
import pytest_asyncio
from fastapi import Depends, FastAPI
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import (
    PASSWORD_CHANGE_REQUIRED_DETAIL,
    PERMISSION_DENIED_DETAIL,
    current_session,
    require_permission,
)
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.database import get_session
from app.core.permissions import ALL_PERMISSION_CODES, PermissionCode
from app.core.security import hash_password
from app.models import Permission, Role, User
from app.models.identity import user_roles
from app.services.auth import log_in
from app.services.sessions import SessionContext

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

EMAIL = "ada@example.com"
OTHER_EMAIL = "grace@example.com"
STRONG_PASSWORD = "correct horse battery staple"
NEW_PASSWORD = "a fresh correct horse battery staple"
CLIENT_IP = "203.0.113.7"

T0 = datetime(2026, 10, 10, 12, 0, 0, tzinfo=UTC)


# --- helpers -----------------------------------------------------------------


async def add_user(session: AsyncSession, *, email: str = EMAIL, **overrides: object) -> User:
    user = User(
        email=email,
        full_name="Ada Lovelace",
        hashed_password=hash_password(STRONG_PASSWORD),
        # The collection is initialised explicitly: tests append roles after
        # this function flushed the row, and touching an unloaded collection
        # on a persistent object would lazy-load — a `MissingGreenlet` under
        # asyncio (the same trap `make_role` documents).
        roles=[],
        **overrides,
    )
    session.add(user)
    await session.flush()
    return user


async def make_role(session: AsyncSession, name: str, codes: list[str]) -> Role:
    """A role holding exactly ``codes``, creating the permission rows it needs.

    The whole loop runs inside ``no_autoflush``: the permission lookups would
    otherwise *flush the role mid-build* (its INSERT is pending), and the
    first append after that touches a persistent object's never-loaded
    collection — a lazy load, which under asyncio is a ``MissingGreenlet``.
    Pending objects append purely in memory, and the single flush at the end
    writes role, permissions and grants together.
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


def session_cookies(token: str, csrf: str = "unused") -> dict[str, str]:
    return {SESSION_COOKIE_NAME: token, CSRF_COOKIE_NAME: csrf}


def csrf_headers(csrf: str) -> dict[str, str]:
    return {"Origin": "http://localhost:5173", "X-CSRF-Token": csrf}


async def login(client: httpx.AsyncClient, *, email: str = EMAIL) -> tuple[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": STRONG_PASSWORD},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200, response.text
    return (
        cookie_value(one_cookie(response, SESSION_COOKIE_NAME)),
        cookie_value(one_cookie(response, CSRF_COOKIE_NAME)),
    )


def build_scratch_app(calls: list[str]) -> FastAPI:
    """The dependencies, mounted on endpoints that exist only to be guarded."""
    scratch = FastAPI()

    @scratch.get("/regular")
    async def regular(
        context: Annotated[SessionContext, Depends(current_session)],
    ) -> dict[str, str]:
        calls.append("regular")
        return {"email": context.user.email}

    @scratch.get("/users")
    async def users(
        context: Annotated[SessionContext, Depends(require_permission(PermissionCode.USERS_READ))],
    ) -> dict[str, str]:
        calls.append("users")
        return {"secret": "user-directory-contents"}

    @scratch.get("/roles")
    async def roles(
        context: Annotated[
            SessionContext, Depends(require_permission(PermissionCode.ROLES_MANAGE))
        ],
    ) -> dict[str, str]:
        calls.append("roles")
        return {"secret": "role-matrix-contents"}

    return scratch


@pytest_asyncio.fixture
async def scratch(
    session: AsyncSession,
) -> AsyncIterator[tuple[httpx.AsyncClient, list[str]]]:
    """The scratch app over the rollback session, with a call recorder."""
    calls: list[str] = []
    scratch_app = build_scratch_app(calls)

    async def session_override() -> AsyncIterator[AsyncSession]:
        yield session

    scratch_app.dependency_overrides[get_session] = session_override
    client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=scratch_app, client=(CLIENT_IP, 40301)),
        base_url="http://testserver",
    )
    try:
        yield client, calls
    finally:
        await client.aclose()


# --- the union, through /auth/me ----------------------------------------------


async def test_me_returns_identity_roles_and_the_deduped_sorted_union(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await add_user(session, phone="+971 50 000 0000")
    reader = await make_role(session, "reader", ["users.read", "notifications.read"])
    editor = await make_role(session, "editor", ["users.read", "roles.read"])
    user.roles.extend([reader, editor])
    await session.flush()
    token, _ = await login(client)

    as_cookies(client, session_cookies(token))
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user.id)
    assert body["email"] == EMAIL
    assert body["full_name"] == "Ada Lovelace"
    assert body["phone"] == "+971 50 000 0000"
    assert body["must_change_password"] is False
    assert body["is_superuser"] is False
    assert body["created_at"] is not None  # the F042 profile page's "member since"
    assert body["roles"] == ["editor", "reader"]  # sorted names
    # The union across roles, deduplicated and sorted: users.read is held by
    # both roles and appears once.
    assert body["permissions"] == ["notifications.read", "roles.read", "users.read"]
    # Nothing credential-shaped in the answer.
    assert STRONG_PASSWORD not in response.text
    assert "argon2" not in response.text


async def test_a_superuser_holds_every_code_without_any_role(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session, is_superuser=True)
    token, _ = await login(client)

    as_cookies(client, session_cookies(token))
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["roles"] == []
    # The expansion, not a wildcard: every code by name, so the frontend
    # checks set membership and never special-cases a flag.
    assert body["permissions"] == sorted(ALL_PERMISSION_CODES)
    # The flag rides along truthfully (the SPA's access model carries it).
    assert body["is_superuser"] is True


async def test_me_is_reachable_during_a_forced_password_change(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session, must_change_password=True)
    token, _ = await login(client)

    as_cookies(client, session_cookies(token))
    response = await client.get("/api/v1/auth/me")

    # 200: this is exactly how the SPA learns the flag is set and where to
    # route — gating it would leave the frontend guessing.
    assert response.status_code == 200
    assert response.json()["must_change_password"] is True


# --- the union, through the dependencies ---------------------------------------


async def test_access_is_granted_by_either_role_and_denied_without_either(
    client: httpx.AsyncClient, scratch: tuple[httpx.AsyncClient, list[str]], session: AsyncSession
) -> None:
    scratch_client, calls = scratch
    ada = await add_user(session)
    grace = await add_user(session, email=OTHER_EMAIL)
    reader = await make_role(session, "reader", ["users.read"])
    manager = await make_role(session, "roles.manager", ["roles.manage"])
    # Two roles for Ada — each code comes from a *different* role, which is
    # the union doing the work, not one generous role. Grace holds one.
    ada.roles.extend([reader, manager])
    grace.roles.append(reader)
    await session.flush()

    ada_token, _ = await login(client)
    grace_token, _ = await login(client, email=OTHER_EMAIL)

    as_cookies(scratch_client, session_cookies(ada_token))
    assert (await scratch_client.get("/users")).status_code == 200
    assert (await scratch_client.get("/roles")).status_code == 200

    # Grace holds `reader` only: users.read yes, roles.manage no.
    as_cookies(scratch_client, session_cookies(grace_token))
    assert (await scratch_client.get("/users")).status_code == 200
    denied = await scratch_client.get("/roles")
    assert denied.status_code == 403
    assert denied.json()["detail"] == PERMISSION_DENIED_DETAIL
    assert "role-matrix-contents" not in denied.text
    assert calls.count("roles") == 1  # Ada's call, never Grace's


async def test_permissions_are_re_evaluated_on_every_request(
    scratch: tuple[httpx.AsyncClient, list[str]], session: AsyncSession
) -> None:
    scratch_client, _ = scratch
    user = await add_user(session)
    reader = await make_role(session, "reader", ["users.read"])
    user.roles.append(reader)
    await session.commit()

    # The ids are captured now: `expunge_all` below detaches the objects, so
    # nothing may be read from them afterwards.
    user_id, role_id = user.id, reader.id

    issued = await log_in(
        session, email=EMAIL, password=STRONG_PASSWORD, client_ip=CLIENT_IP, now=T0
    )
    as_cookies(scratch_client, session_cookies(issued.token))
    assert (await scratch_client.get("/users")).status_code == 200

    # The role is revoked *in the database* (a direct association delete, so
    # nothing in Python holds an opinion), and the session is emptied of every
    # cached object — the next request then starts exactly like a production
    # one, with an empty identity map, and must load the graph fresh.
    await session.execute(delete(user_roles).where(user_roles.c.user_id == user_id))
    await session.commit()
    session.expunge_all()

    denied = await scratch_client.get("/users")
    assert denied.status_code == 403
    assert denied.json()["detail"] == PERMISSION_DENIED_DETAIL

    # And granted again — same cookie, no re-login anywhere in this test.
    await session.execute(
        user_roles.insert().values(user_id=user_id, role_id=role_id),
    )
    await session.commit()
    session.expunge_all()
    assert (await scratch_client.get("/users")).status_code == 200


# --- fail closed ----------------------------------------------------------------


async def test_no_session_is_401_everywhere(
    scratch: tuple[httpx.AsyncClient, list[str]],
) -> None:
    scratch_client, calls = scratch
    for path in ("/regular", "/users", "/roles"):
        response = await scratch_client.get(path)
        assert response.status_code == 401, path
    assert calls == []


async def test_a_deactivated_user_fails_closed_everywhere(
    scratch: tuple[httpx.AsyncClient, list[str]], session: AsyncSession
) -> None:
    scratch_client, calls = scratch
    user = await add_user(session)
    reader = await make_role(session, "reader", ["users.read"])
    user.roles.append(reader)
    await session.commit()

    issued = await log_in(
        session, email=EMAIL, password=STRONG_PASSWORD, client_ip=CLIENT_IP, now=T0
    )
    user.is_active = False
    await session.commit()

    as_cookies(scratch_client, session_cookies(issued.token))
    assert (await scratch_client.get("/regular")).status_code == 401
    assert (await scratch_client.get("/users")).status_code == 401
    assert calls == []


# --- the forced-change gate ------------------------------------------------------


async def test_the_forced_change_gate_holds_until_the_change_completes(
    client: httpx.AsyncClient, scratch: tuple[httpx.AsyncClient, list[str]], session: AsyncSession
) -> None:
    scratch_client, calls = scratch
    user = await add_user(session, must_change_password=True)
    reader = await make_role(session, "reader", ["users.read"])
    user.roles.append(reader)
    await session.flush()
    token, csrf = await login(client)

    as_cookies(scratch_client, session_cookies(token))
    # The flag check runs before the permission check: a user who *holds*
    # users.read still gets the password-change 403, not the permission one.
    regular = await scratch_client.get("/regular")
    assert regular.status_code == 403
    assert regular.json()["detail"] == PASSWORD_CHANGE_REQUIRED_DETAIL
    guarded = await scratch_client.get("/users")
    assert guarded.status_code == 403
    assert guarded.json()["detail"] == PASSWORD_CHANGE_REQUIRED_DETAIL
    assert calls == []  # the endpoint bodies never ran

    # The auth endpoints stay reachable (F030's change is the way out)...
    as_cookies(client, session_cookies(token, csrf))
    changed = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": STRONG_PASSWORD, "new_password": NEW_PASSWORD},
        headers=csrf_headers(csrf),
    )
    assert changed.status_code == 204

    # ...and the very next request through the *rotated* session passes.
    fresh = cookie_value(one_cookie(changed, SESSION_COOKIE_NAME))
    as_cookies(scratch_client, session_cookies(fresh))
    assert (await scratch_client.get("/regular")).status_code == 200
    assert calls == ["regular"]

    # The flag is gone in the database, not only in the response.
    assert user.must_change_password is False


async def test_logout_all_stays_reachable_during_a_forced_password_change(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session, must_change_password=True)
    token, csrf = await login(client)

    as_cookies(client, session_cookies(token, csrf))
    response = await client.post("/api/v1/auth/logout-all", headers=csrf_headers(csrf))

    # Ending sessions is never something the flag should prevent — a user
    # mid-forced-change is exactly who might want to revoke everything.
    assert response.status_code == 204
