"""The role catalogue's read slice (F034; F035 extends).

Small on purpose: one endpoint, its guard, and its order. The helpers mirror
`test_admin_users.py`'s (the same lending-session fixtures), kept local per the
suite's convention.
"""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import PERMISSION_DENIED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.csrf import CSRF_HEADER_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import Permission, Role, User

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"
ROLES_API = "/api/v1/admin/roles"


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
) -> None:
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
    token = session_cookie.split("=", 1)[1].split(";", 1)[0]
    csrf = csrf_cookie.split("=", 1)[1].split(";", 1)[0]
    client.cookies.clear()
    client.cookies.update({SESSION_COOKIE_NAME: token, CSRF_COOKIE_NAME: csrf})
    client.headers[CSRF_HEADER_NAME] = csrf


async def test_the_catalogue_requires_a_session_and_roles_read(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    assert (await client.get(ROLES_API)).status_code == 401

    await sign_in_with(client, session, [PermissionCode.USERS_READ])
    denied = await client.get(ROLES_API)
    assert denied.status_code == 403
    assert denied.json()["detail"] == PERMISSION_DENIED_DETAIL


async def test_the_catalogue_lists_roles_sorted_by_name(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await make_role(session, "zeta", [PermissionCode.SETTINGS_READ])
    protected = Role(name="alpha", description="The first alphabetically", is_system=True)
    session.add(protected)
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_READ])

    response = await client.get(ROLES_API)

    assert response.status_code == 200, response.text
    items = response.json()["items"]
    # caller-role sorts between alpha and zeta; the fixture roles pin the order.
    names = [item["name"] for item in items]
    assert names == sorted(names)
    alpha = next(item for item in items if item["name"] == "alpha")
    assert alpha["is_system"] is True
    assert alpha["description"] == "The first alphabetically"
    assert set(alpha) == {"id", "name", "description", "is_system"}
    assert "caller-role" in names
