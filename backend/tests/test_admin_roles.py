"""The role catalogue's read slice (F034; F035 extends).

Small on purpose: one endpoint, its guard, and its order. The helpers mirror
`test_admin_users.py`'s (the same lending-session fixtures), kept local per the
suite's convention.
"""

import uuid

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
    client: httpx.AsyncClient,
    session: AsyncSession,
    codes: list[PermissionCode],
    *,
    superuser: bool = False,
) -> User:
    user = await add_user(session, email="admin@example.com", is_superuser=superuser)
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
    return user


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
    # F035 extends the item with the grant codes (the matrix reads roles and
    # their grants in one answer).
    assert set(alpha) == {"id", "name", "description", "is_system", "permission_codes"}
    assert alpha["permission_codes"] == []
    caller_role = next(item for item in items if item["name"] == "caller-role")
    assert caller_role["permission_codes"] == ["roles.read"]
    assert "caller-role" in names


# --- F035: create, update, delete ---------------------------------------------


async def codes_of(session: AsyncSession, role_id: uuid.UUID) -> list[str]:
    """The role's grant codes, re-read from the database (populate_existing:
    a relationship write must not be trusted through the identity map)."""
    role = await session.scalar(
        select(Role).where(Role.id == role_id).execution_options(populate_existing=True)
    )
    assert role is not None
    return sorted(permission.code for permission in role.permissions)


async def test_role_mutations_require_a_session_and_roles_manage(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    role = await make_role(session, "target", [])
    await session.commit()

    replies = [
        await client.post(ROLES_API, json={"name": "n", "permission_codes": []}),
        await client.patch(f"{ROLES_API}/{role.id}", json={"name": "n2"}),
        await client.delete(f"{ROLES_API}/{role.id}"),
        await client.put(f"{ROLES_API}/matrix", json={"roles": []}),
    ]
    for response in replies:
        assert response.status_code == 401, response.text

    # A read-only caller: every mutation is the generic guard 403.
    await sign_in_with(client, session, [PermissionCode.ROLES_READ])
    replies = [
        await client.post(ROLES_API, json={"name": "n", "permission_codes": []}),
        await client.patch(f"{ROLES_API}/{role.id}", json={"name": "n2"}),
        await client.delete(f"{ROLES_API}/{role.id}"),
        await client.put(f"{ROLES_API}/matrix", json={"roles": []}),
    ]
    for response in replies:
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == PERMISSION_DENIED_DETAIL


async def test_create_attaches_grants_and_deduplicates_codes(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    session.add(Permission(code=PermissionCode.USERS_READ))
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE, PermissionCode.USERS_READ])

    response = await client.post(
        ROLES_API,
        json={
            "name": "  Reviewer  ",
            "description": "  Looks at things  ",
            "permission_codes": [PermissionCode.USERS_READ, PermissionCode.USERS_READ],
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Reviewer"  # trimmed
    assert body["description"] == "Looks at things"
    assert body["permission_codes"] == [PermissionCode.USERS_READ]  # deduplicated
    assert body["is_system"] is False


async def test_create_refuses_duplicate_names_and_unknown_codes(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await make_role(session, "taken", [])
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE])

    duplicate = await client.post(ROLES_API, json={"name": "taken", "permission_codes": []})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "A role with this name already exists."

    unknown = await client.post(
        ROLES_API, json={"name": "fresh", "permission_codes": ["does.not.exist"]}
    )
    assert unknown.status_code == 422
    (entry,) = unknown.json()["detail"]
    assert entry["loc"] == ["body", "permission_codes"]
    assert "does.not.exist" in entry["msg"]


async def test_create_cannot_grant_beyond_the_callers_own_codes(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    session.add(Permission(code=PermissionCode.SETTINGS_MANAGE))
    await session.commit()
    # The caller holds roles.manage ONLY: settings.manage is beyond them.
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE])

    escalation = await client.post(
        ROLES_API, json={"name": "power", "permission_codes": [PermissionCode.SETTINGS_MANAGE]}
    )
    assert escalation.status_code == 403
    assert "permissions you do not hold" in escalation.json()["detail"]

    within = await client.post(
        ROLES_API, json={"name": "peers", "permission_codes": [PermissionCode.ROLES_MANAGE]}
    )
    assert within.status_code == 201


async def test_patch_renames_and_protects_the_system_role(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    role = await make_role(session, "rename-me", [])
    system = Role(name="seed-owned", is_system=True)
    session.add(system)
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE])

    renamed = await client.patch(
        f"{ROLES_API}/{role.id}", json={"name": "renamed", "description": None}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "renamed"

    empty = await client.patch(f"{ROLES_API}/{role.id}", json={})
    assert empty.status_code == 400

    protected = await client.patch(f"{ROLES_API}/{system.id}", json={"name": "hijacked"})
    assert protected.status_code == 403
    assert "managed by the seed" in protected.json()["detail"]


async def test_delete_removes_unassigned_roles_and_refuses_assigned_ones(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    free = await make_role(session, "free", [])
    held = await make_role(session, "held", [])
    holder = await add_user(session, email="holder@example.com")
    holder.roles.append(held)
    system = Role(name="seed-owned", is_system=True)
    session.add(system)
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE])

    removed = await client.delete(f"{ROLES_API}/{free.id}")
    assert removed.status_code == 204
    assert await session.get(Role, free.id) is None

    in_use = await client.delete(f"{ROLES_API}/{held.id}")
    assert in_use.status_code == 409
    assert "assigned to users" in in_use.json()["detail"]
    assert await session.get(Role, held.id) is not None  # nothing happened

    protected = await client.delete(f"{ROLES_API}/{system.id}")
    assert protected.status_code == 403


# --- F035: the atomic matrix ---------------------------------------------------


def matrix_entry(role: Role, codes: list[PermissionCode | str]) -> dict[str, object]:
    return {"role_id": str(role.id), "permission_codes": [str(code) for code in codes]}


async def test_matrix_save_replaces_grants_in_one_commit(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    first = await make_role(session, "first", [PermissionCode.SETTINGS_READ])
    second = await make_role(session, "second", [])
    for code in (
        PermissionCode.SETTINGS_MANAGE,
        PermissionCode.USERS_READ,
        PermissionCode.AUDIT_READ,
    ):
        session.add(Permission(code=code))
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE], superuser=True)

    response = await client.put(
        f"{ROLES_API}/matrix",
        json={
            "roles": [
                matrix_entry(first, [PermissionCode.USERS_READ, PermissionCode.SETTINGS_MANAGE]),
                matrix_entry(second, [PermissionCode.AUDIT_READ]),
            ]
        },
    )

    assert response.status_code == 204, response.text
    assert await codes_of(session, first.id) == [
        PermissionCode.SETTINGS_MANAGE,
        PermissionCode.USERS_READ,
    ]
    # The original grant (settings.read) is gone: replace, not merge.
    assert await codes_of(session, second.id) == [PermissionCode.AUDIT_READ]


async def test_matrix_save_rolls_back_when_a_later_entry_is_invalid(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    first = await make_role(session, "first", [PermissionCode.SETTINGS_READ])
    second = await make_role(session, "second", [])
    session.add(Permission(code=PermissionCode.SETTINGS_MANAGE))
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE], superuser=True)

    before = await codes_of(session, first.id)
    response = await client.put(
        f"{ROLES_API}/matrix",
        json={
            "roles": [
                # Entry zero is perfectly valid — and must still not be saved.
                matrix_entry(first, [PermissionCode.SETTINGS_MANAGE]),
                matrix_entry(second, ["does.not.exist"]),
            ]
        },
    )

    assert response.status_code == 422
    (entry,) = response.json()["detail"]
    assert entry["loc"] == ["body", "roles.1.permission_codes"]  # addressable per entry
    assert await codes_of(session, first.id) == before  # the rollback: nothing applied


async def test_matrix_save_addresses_unknown_roles(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE], superuser=True)

    response = await client.put(
        f"{ROLES_API}/matrix",
        json={"roles": [{"role_id": str(uuid.uuid4()), "permission_codes": []}]},
    )

    assert response.status_code == 422
    (entry,) = response.json()["detail"]
    assert entry["loc"] == ["body", "roles.0.role_id"]


async def test_matrix_save_accepts_the_system_column_unchanged_only(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    system_permission = Permission(code=PermissionCode.USERS_READ)
    session.add(system_permission)
    await session.flush()
    system = Role(name="seed-owned", is_system=True, permissions=[system_permission])
    session.add(system)
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE], superuser=True)

    # Unchanged: the payload may include the protected column (a UI sends its
    # whole visible matrix) and the save passes.
    unchanged = await client.put(
        f"{ROLES_API}/matrix",
        json={"roles": [matrix_entry(system, [PermissionCode.USERS_READ])]},
    )
    assert unchanged.status_code == 204, unchanged.text

    session.add(Permission(code=PermissionCode.SETTINGS_MANAGE))
    await session.commit()
    changed = await client.put(
        f"{ROLES_API}/matrix",
        json={"roles": [matrix_entry(system, [PermissionCode.SETTINGS_MANAGE])]},
    )
    assert changed.status_code == 403
    assert "managed by the seed" in changed.json()["detail"]
    assert await codes_of(session, system.id) == [PermissionCode.USERS_READ]


async def test_matrix_save_enforces_the_subset_rule_on_both_sets(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    # make_role already creates the settings.manage row — adding it again here
    # would violate the unique code index at commit.
    beyond = await make_role(session, "beyond", [PermissionCode.SETTINGS_MANAGE])
    within = await make_role(session, "within", [])
    await session.commit()
    # The caller holds roles.manage only.
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE])

    # Granting beyond yourself: refused.
    grant_escalation = await client.put(
        f"{ROLES_API}/matrix",
        json={"roles": [matrix_entry(within, [PermissionCode.SETTINGS_MANAGE])]},
    )
    assert grant_escalation.status_code == 403
    assert "permissions you do not hold" in grant_escalation.json()["detail"]

    # Editing a role whose *current* grants are beyond you — even to remove
    # them — is refused too (authority over a column you cannot see).
    old_set_refusal = await client.put(
        f"{ROLES_API}/matrix", json={"roles": [matrix_entry(beyond, [])]}
    )
    assert old_set_refusal.status_code == 403

    # And an edit entirely within the caller's own codes passes.
    accepted = await client.put(
        f"{ROLES_API}/matrix",
        json={"roles": [matrix_entry(within, [PermissionCode.ROLES_MANAGE])]},
    )
    assert accepted.status_code == 204, accepted.text


async def test_matrix_saved_grants_appear_in_the_catalogue(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    role = await make_role(session, "granted", [])
    session.add(Permission(code=PermissionCode.AUDIT_READ))
    await session.commit()
    await sign_in_with(client, session, [PermissionCode.ROLES_MANAGE], superuser=True)

    saved = await client.put(
        f"{ROLES_API}/matrix", json={"roles": [matrix_entry(role, [PermissionCode.AUDIT_READ])]}
    )
    assert saved.status_code == 204

    # The same endpoint F036's matrix will load from.
    listing = await client.get(ROLES_API)
    item = next(item for item in listing.json()["items"] if item["name"] == "granted")
    assert item["permission_codes"] == [PermissionCode.AUDIT_READ]
