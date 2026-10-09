"""The seed contract, against real PostgreSQL (F027; BP-6.3b, BP-8.2i).

Idempotency here has an exact, testable meaning, and these tests pin each
clause of it separately: a re-run changes nothing; existing permission rows
(and their operator-edited descriptions) are never updated; non-system roles
belong to F036 once created and the seed never touches them; and the one
invariant — ``super_admin`` holds every registered code — is *restored* on
every run, including codes registered later (F037). A "sync everything"
rewrite passes the first test and fails the others.

The database fixture rolls each test back, so every test starts from an empty
identity schema and can seed from scratch.
"""

import re

import pytest
from sqlalchemy import delete, func, select

from app.core.permissions import (
    ALL_PERMISSION_CODES,
    PERMISSION_DESCRIPTIONS,
    PermissionCode,
)
from app.models import Permission, Role, User
from app.models.identity import (
    PERMISSION_CODE_PATTERN,
    role_permissions,
)
from app.seed import (
    ADMIN_GRANTS,
    SUPER_ADMIN_ROLE_NAME,
    VIEWER_GRANTS,
    SeedReport,
    seed,
)

# The exact read set the `viewer` role ships with (C16). Written out literally
# on purpose: the point is that a change to VIEWER_GRANTS fails a test and
# gets a decision, not that the constant equals itself.
EXPECTED_VIEWER_CODES = {
    "users.read",
    "roles.read",
    "permissions.read",
    "settings.read",
    "audit.read",
    "notifications.read",
    "notifications.manage_own",
    "files.read",
    "reports.generate",
}

EXPECTED_ADMIN_WITHHELD = {"roles.manage", "permissions.manage"}


async def grant_codes(session, role_name: str) -> set[str]:
    rows = await session.scalars(
        select(Permission.code)
        .join(role_permissions, role_permissions.c.permission_id == Permission.id)
        .join(Role, Role.id == role_permissions.c.role_id)
        .where(Role.name == role_name)
    )
    return set(rows.all())


async def role_id_of(session, role_name: str):
    return await session.scalar(select(Role.id).where(Role.name == role_name))


# --- pure: the vocabulary itself ---------------------------------------------


def test_every_shipped_code_is_resource_dot_action() -> None:
    for code in ALL_PERMISSION_CODES:
        assert re.fullmatch(PERMISSION_CODE_PATTERN, code.value), code


def test_every_shipped_code_has_a_description() -> None:
    assert set(PERMISSION_DESCRIPTIONS) == set(ALL_PERMISSION_CODES)
    assert all(PERMISSION_DESCRIPTIONS[code].strip() for code in ALL_PERMISSION_CODES)


def test_a_noop_report_reads_like_a_no_op() -> None:
    noop = SeedReport(0, 0, 0, 0, 0)
    assert noop.is_noop
    assert noop.summary_lines() == ["Seed: nothing to do — roles and permissions are up to date."]
    assert not SeedReport(1, 0, 0, 0, 0).is_noop


# --- the first run -----------------------------------------------------------


@pytest.mark.asyncio
async def test_seed_creates_every_code_and_the_three_roles(session) -> None:
    report = await seed(session)

    assert not report.is_noop
    assert report.permissions_created == len(ALL_PERMISSION_CODES)
    assert report.roles_created == 3

    stored = await session.scalars(select(Permission.code))
    assert set(stored.all()) == {code.value for code in ALL_PERMISSION_CODES}

    for code in ALL_PERMISSION_CODES:
        description = await session.scalar(
            select(Permission.description).where(Permission.code == code.value)
        )
        assert description == PERMISSION_DESCRIPTIONS[code], code


@pytest.mark.asyncio
async def test_only_super_admin_is_a_system_role(session) -> None:
    await seed(session)

    roles = (await session.scalars(select(Role))).all()
    by_name = {role.name: role for role in roles}
    assert set(by_name) == {SUPER_ADMIN_ROLE_NAME, "admin", "viewer"}
    assert by_name[SUPER_ADMIN_ROLE_NAME].is_system is True
    assert by_name["admin"].is_system is False
    assert by_name["viewer"].is_system is False
    assert all(role.description for role in roles)


@pytest.mark.asyncio
async def test_the_granted_sets_are_exactly_the_documented_policy(session) -> None:
    await seed(session)

    all_codes = {code.value for code in ALL_PERMISSION_CODES}
    assert await grant_codes(session, SUPER_ADMIN_ROLE_NAME) == all_codes

    admin_codes = await grant_codes(session, "admin")
    assert admin_codes == all_codes - EXPECTED_ADMIN_WITHHELD
    assert set(ADMIN_GRANTS) == {PermissionCode(code) for code in admin_codes}

    viewer_codes = await grant_codes(session, "viewer")
    assert viewer_codes == EXPECTED_VIEWER_CODES
    assert set(VIEWER_GRANTS) == {PermissionCode(code) for code in viewer_codes}


@pytest.mark.asyncio
async def test_the_seed_creates_no_users(session) -> None:
    await seed(session)

    user_count = await session.scalar(select(func.count()).select_from(User))
    assert user_count == 0


# --- idempotency and the invariants ------------------------------------------


@pytest.mark.asyncio
async def test_rerunning_the_seed_changes_nothing(session) -> None:
    await seed(session)
    grant_count = await session.scalar(select(func.count()).select_from(role_permissions))

    second = await seed(session)

    assert second.is_noop
    assert await session.scalar(select(func.count()).select_from(role_permissions)) == grant_count
    assert await session.scalar(select(func.count()).select_from(Permission)) == len(
        ALL_PERMISSION_CODES
    )
    assert await session.scalar(select(func.count()).select_from(Role)) == 3


@pytest.mark.asyncio
async def test_an_operator_edited_permission_description_survives_a_rerun(session) -> None:
    await seed(session)
    permission = await session.scalar(
        select(Permission).where(Permission.code == PermissionCode.AUDIT_READ.value)
    )
    permission.description = "Edited in F037's dictionary."
    await session.flush()

    await seed(session)

    assert permission.description == "Edited in F037's dictionary."


@pytest.mark.asyncio
async def test_non_system_roles_belong_to_the_matrix_after_creation(session) -> None:
    await seed(session)
    viewer_id = await role_id_of(session, "viewer")
    audit_permission_id = await session.scalar(
        select(Permission.id).where(Permission.code == PermissionCode.AUDIT_READ.value)
    )
    await session.execute(
        delete(role_permissions).where(
            role_permissions.c.role_id == viewer_id,
            role_permissions.c.permission_id == audit_permission_id,
        )
    )
    session.add(Role(name="resource_manager", description="Stage B will need one."))
    await session.flush()

    report = await seed(session)

    # The removed grant was the operator's (the matrix's) call, not drift.
    assert "audit.read" not in await grant_codes(session, "viewer")
    assert report.grants_added == 0
    custom = await session.scalar(select(Role).where(Role.name == "resource_manager"))
    assert custom is not None
    assert await grant_codes(session, "resource_manager") == set()


@pytest.mark.asyncio
async def test_the_super_admin_invariant_is_restored_not_trusted(session) -> None:
    await seed(session)
    super_admin_id = await role_id_of(session, SUPER_ADMIN_ROLE_NAME)
    users_read_id = await session.scalar(
        select(Permission.id).where(Permission.code == PermissionCode.USERS_READ.value)
    )
    await session.execute(
        delete(role_permissions).where(
            role_permissions.c.role_id == super_admin_id,
            role_permissions.c.permission_id == users_read_id,
        )
    )
    super_admin = await session.scalar(select(Role).where(Role.name == SUPER_ADMIN_ROLE_NAME))
    super_admin.is_system = False
    # Simulate a code registered *after* the first seed (F037's dictionary
    # grows; the protected role must grow with it).
    session.add(Permission(code="widgets.read", description="Registered later."))
    await session.flush()

    report = await seed(session)

    assert await grant_codes(session, SUPER_ADMIN_ROLE_NAME) == {
        code.value for code in ALL_PERMISSION_CODES
    } | {"widgets.read"}
    assert report.grants_added == 2  # users.read back + widgets.read
    assert report.grants_removed == 0
    assert report.system_flags_restored == 1
    assert super_admin.is_system is True
    # The new code reached nobody else: admin and viewer keep their sets.
    assert "widgets.read" not in await grant_codes(session, "admin")
    assert "widgets.read" not in await grant_codes(session, "viewer")
