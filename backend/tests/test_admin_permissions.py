"""The permission dictionary's read slice (F036; F037 extends).

Small on purpose: one endpoint, its guard, its order — the helpers mirror
`test_admin_roles.py`'s.
"""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import PERMISSION_DENIED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import Permission, Role, User

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

PASSWORD = "correct horse battery staple"
PERMISSIONS_API = "/api/v1/admin/permissions"


async def add_user(session: AsyncSession, *, email: str, **overrides: object) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0].title(),
        hashed_password=hash_password(PASSWORD),
        roles=[],
        **overrides,
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


# --- F037: the CRUD guardrails -------------------------------------------------


async def test_mutations_require_a_session_and_permissions_manage(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await make_role(session, "target", [PermissionCode.SETTINGS_READ])
    await session.commit()

    replies = [
        await client.post(PERMISSIONS_API, json={"code": "x.y", "description": None}),
        await client.patch(f"{PERMISSIONS_API}/{target.id}", json={"description": "x"}),
        await client.delete(f"{PERMISSIONS_API}/{target.id}"),
    ]
    for response in replies:
        assert response.status_code == 401, response.text

    # permissions.read only: every mutation is the generic guard 403.
    await sign_in_with(client, session, [PermissionCode.PERMISSIONS_READ])
    replies = [
        await client.post(PERMISSIONS_API, json={"code": "x.y", "description": None}),
        await client.patch(f"{PERMISSIONS_API}/{target.id}", json={"description": "x"}),
        await client.delete(f"{PERMISSIONS_API}/{target.id}"),
    ]
    for response in replies:
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == PERMISSION_DENIED_DETAIL


async def test_create_adds_a_code_and_enforces_its_shape(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(
        client, session, [PermissionCode.PERMISSIONS_MANAGE, PermissionCode.PERMISSIONS_READ]
    )

    created = await client.post(
        PERMISSIONS_API,
        json={"code": "  reports.export  ", "description": "  Export reports.  "},
    )
    assert created.status_code == 201, created.text
    assert (
        created.json()["code"] == "reports.export"
    )  # trimmed, not lowercased into a different shape
    assert created.json()["description"] == "Export reports."

    # The shape is the model's own pattern, refused — never silently fixed.
    for bad in ("Reports.Export", "nodot", "users.", ".read", "users.Read"):
        refused = await client.post(PERMISSIONS_API, json={"code": bad, "description": None})
        assert refused.status_code == 422, bad
        assert refused.json()["detail"][0]["loc"] == ["body", "code"]

    duplicate = await client.post(
        PERMISSIONS_API, json={"code": "reports.export", "description": None}
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "A permission with this code already exists."

    listing = await client.get(PERMISSIONS_API)
    codes = [item["code"] for item in listing.json()["items"]]
    assert codes == sorted(codes)
    assert "reports.export" in codes


async def test_creating_a_code_needs_no_subset_rule(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    # C26: a code confers nothing until granted, and a matrix save already
    # enforces "grant only what you hold" — requiring the editor to hold a
    # code that does not exist yet would be an unsatisfiable rule.
    await sign_in_with(client, session, [PermissionCode.PERMISSIONS_MANAGE])

    created = await client.post(
        PERMISSIONS_API, json={"code": "notifications.export", "description": None}
    )

    assert created.status_code == 201, created.text


async def test_description_edits_are_allowed_on_codes_in_use(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    # The caller's own role holds permissions.read; the code is in use and
    # still freely re-describable — prose carries no authority.
    user = await add_user(session, email="editor@example.com")
    role = await make_role(session, "editor-role", [PermissionCode.PERMISSIONS_MANAGE])
    user.roles.append(role)
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.PERMISSIONS_MANAGE])
    permission = await session.scalar(
        select(Permission).where(Permission.code == PermissionCode.PERMISSIONS_MANAGE)
    )
    assert permission is not None

    updated = await client.patch(
        f"{PERMISSIONS_API}/{permission.id}", json={"description": "  The dictionary's key.  "}
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["description"] == "The dictionary's key."
    assert updated.json()["code"] == PermissionCode.PERMISSIONS_MANAGE


async def test_a_code_in_use_cannot_be_renamed_or_deleted(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    used = Permission(code=PermissionCode.AUDIT_READ, description="Granted.")
    session.add(used)
    await session.flush()
    role = Role(name="auditor", permissions=[used])
    session.add(role)
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.PERMISSIONS_MANAGE])

    renamed = await client.patch(f"{PERMISSIONS_API}/{used.id}", json={"code": "audit.view"})
    assert renamed.status_code == 409
    assert "cannot be renamed or deleted" in renamed.json()["detail"]

    removed = await client.delete(f"{PERMISSIONS_API}/{used.id}")
    assert removed.status_code == 409

    # Nothing moved: the grant still means what it reads.
    refreshed = await session.scalar(
        select(Permission).where(Permission.id == used.id).execution_options(populate_existing=True)
    )
    assert refreshed is not None and refreshed.code == PermissionCode.AUDIT_READ


async def test_an_unused_code_can_be_renamed_onto_nothing_and_deleted(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    session.add(Permission(code=PermissionCode.USERS_READ))
    fresh = Permission(code="reports.export", description=None)
    session.add(fresh)
    await session.commit()
    # Captured before the requests: the 409 collision below rolls the shared
    # test session back, which expires every object in it (ARCHITECTURE §12).
    fresh_id = fresh.id
    await sign_in_with(client, session, [PermissionCode.PERMISSIONS_MANAGE])

    # A typo fixed before first grant: allowed.
    renamed = await client.patch(f"{PERMISSIONS_API}/{fresh_id}", json={"code": "reports.download"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["code"] == "reports.download"

    # ...but a rename may not land on an existing code.
    collision = await client.patch(
        f"{PERMISSIONS_API}/{fresh_id}", json={"code": PermissionCode.USERS_READ}
    )
    assert collision.status_code == 409

    removed = await client.delete(f"{PERMISSIONS_API}/{fresh_id}")
    assert removed.status_code == 204
    assert await session.get(Permission, fresh_id) is None


async def test_empty_edits_and_unknown_ids(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(
        client, session, [PermissionCode.PERMISSIONS_MANAGE, PermissionCode.PERMISSIONS_READ]
    )
    missing = uuid.uuid4()

    assert (
        await client.patch(f"{PERMISSIONS_API}/{missing}", json={"code": "a.b"})
    ).status_code == 404
    assert (await client.delete(f"{PERMISSIONS_API}/{missing}")).status_code == 404
    assert (await client.get(f"{PERMISSIONS_API}/{missing}")).status_code == 404

    existing = await session.scalar(
        select(Permission).where(Permission.code == PermissionCode.PERMISSIONS_MANAGE)
    )
    assert existing is not None
    empty = await client.patch(f"{PERMISSIONS_API}/{existing.id}", json={})
    assert empty.status_code == 400
