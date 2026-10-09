"""The permission dictionary's read slice (F036; F037 extends).

Small on purpose: one endpoint, its guard, its order — the helpers mirror
`test_admin_roles.py`'s.
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
PERMISSIONS_API = "/api/v1/admin/permissions"


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


async def test_the_dictionary_requires_a_session_and_permissions_read(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    assert (await client.get(PERMISSIONS_API)).status_code == 401

    await sign_in_with(client, session, [PermissionCode.ROLES_READ])
    denied = await client.get(PERMISSIONS_API)
    assert denied.status_code == 403
    assert denied.json()["detail"] == PERMISSION_DENIED_DETAIL


async def test_the_dictionary_lists_codes_sorted_with_descriptions(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    described = Permission(code=PermissionCode.AUDIT_READ, description="View the audit trail.")
    session.add(described)
    session.add(Permission(code=PermissionCode.USERS_READ))
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.PERMISSIONS_READ])

    response = await client.get(PERMISSIONS_API)

    assert response.status_code == 200, response.text
    items = response.json()["items"]
    codes = [item["code"] for item in items]
    # The caller's own role contributed `permissions.read` (make_role creates
    # the rows it grants); the dictionary shows every row there is.
    assert codes == ["audit.read", "permissions.read", "users.read"]
    audit = items[0]
    assert set(audit) == {"id", "code", "description"}
    assert audit["description"] == "View the audit trail."
    assert items[1]["description"] is None
