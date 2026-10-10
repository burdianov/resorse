"""The identity tables' constraints, against real PostgreSQL (F024).

The acceptance for this task is exactly this: uniqueness and foreign keys hold
in the database, not only in the application. Every test here inserts through
the ORM (or the Core tables for the join rows) and asserts what PostgreSQL
does — a duplicate raising ``IntegrityError``, a cascade removing rows, a
``uuidv7()`` default filling the primary key.
"""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import delete, func, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Permission, Role, User, role_permissions, user_roles

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


def make_user(email: str = "ada@example.com", **overrides: object) -> User:
    values: dict[str, object] = {
        "email": email,
        "full_name": "Ada Lovelace",
        "hashed_password": "$argon2id$placeholder",
        **overrides,
    }
    return User(**values)


async def test_a_user_gets_a_database_generated_uuid_and_utc_instants(
    session: AsyncSession,
) -> None:
    session.add(make_user())
    await session.flush()

    user = (await session.scalars(select(User))).one()
    assert isinstance(user.id, uuid.UUID)
    # uuidv7: the version nibble is what tells the generator apart from v4.
    assert user.id.version == 7
    # Instants come back timezone-aware and in UTC, whichever zone the server
    # or the session happens to be in (§14: UTC instants for events).
    assert user.created_at.utcoffset() == timedelta(0)
    assert user.updated_at.utcoffset() == timedelta(0)


async def test_email_is_unique(session: AsyncSession) -> None:
    session.add(make_user("ada@example.com"))
    await session.flush()
    session.add(make_user("ada@example.com"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    # The naming convention (F023) is what makes the error name the index.
    assert "ix_users_email" in str(caught.value.orig)


@pytest.mark.parametrize(
    ("label", "email"),
    [
        ("mixed case", "Ada@example.com"),
        ("all upper", "ADA@EXAMPLE.COM"),
    ],
)
async def test_email_must_be_canonical(session: AsyncSession, label: str, email: str) -> None:
    session.add(make_user(email))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_users_email_is_canonical" in str(caught.value.orig)


async def test_a_blank_name_is_rejected(session: AsyncSession) -> None:
    session.add(make_user(full_name="   "))

    with pytest.raises(IntegrityError):
        await session.flush()


async def test_role_names_are_unique(session: AsyncSession) -> None:
    session.add(Role(name="viewer"))
    await session.flush()
    session.add(Role(name="viewer"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ix_roles_name" in str(caught.value.orig)


async def test_permission_codes_are_unique(session: AsyncSession) -> None:
    session.add(Permission(code="users.read"))
    await session.flush()
    session.add(Permission(code="users.read"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ix_permissions_code" in str(caught.value.orig)


@pytest.mark.parametrize(
    ("label", "code"),
    [
        ("a capital resource", "Users.read"),
        ("no separator", "usersread"),
        ("two separators", "users.read.all"),
        ("a leading digit", "1users.read"),
        ("a space", "users. read"),
    ],
)
async def test_permission_codes_must_be_resource_dot_action(
    session: AsyncSession, label: str, code: str
) -> None:
    session.add(Permission(code=code))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_permissions_code_is_resource_dot_action" in str(caught.value.orig)


async def test_a_role_cannot_be_granted_twice(session: AsyncSession) -> None:
    user = make_user()
    role = Role(name="viewer")
    session.add_all([user, role])
    await session.flush()

    await session.execute(insert(user_roles).values(user_id=user.id, role_id=role.id))
    with pytest.raises(IntegrityError) as caught:
        await session.execute(insert(user_roles).values(user_id=user.id, role_id=role.id))

    assert "pk_user_roles" in str(caught.value.orig)


async def test_a_permission_cannot_be_attached_to_a_role_twice(session: AsyncSession) -> None:
    role = Role(name="viewer")
    permission = Permission(code="users.read")
    session.add_all([role, permission])
    await session.flush()

    await session.execute(
        insert(role_permissions).values(role_id=role.id, permission_id=permission.id)
    )
    with pytest.raises(IntegrityError) as caught:
        await session.execute(
            insert(role_permissions).values(role_id=role.id, permission_id=permission.id)
        )

    assert "pk_role_permissions" in str(caught.value.orig)


async def test_memberships_must_point_at_real_rows(session: AsyncSession) -> None:
    user = make_user()
    session.add(user)
    await session.flush()

    with pytest.raises(IntegrityError) as caught:
        await session.execute(insert(user_roles).values(user_id=user.id, role_id=uuid.uuid4()))

    assert "fk_user_roles_role_id_roles" in str(caught.value.orig)


async def test_deleting_a_user_removes_their_memberships(session: AsyncSession) -> None:
    user = make_user()
    role = Role(name="viewer")
    session.add_all([user, role])
    await session.flush()
    await session.execute(insert(user_roles).values(user_id=user.id, role_id=role.id))

    await session.execute(delete(User).where(User.id == user.id))

    remaining = await session.scalar(select(func.count()).select_from(user_roles))
    assert remaining == 0
    # The role itself is untouched: membership cascades, the role does not.
    assert await session.scalar(select(func.count()).select_from(Role)) == 1


async def test_deleting_a_role_removes_memberships_and_permission_links(
    session: AsyncSession,
) -> None:
    user = make_user()
    role = Role(name="viewer")
    permission = Permission(code="users.read")
    session.add_all([user, role, permission])
    await session.flush()
    await session.execute(insert(user_roles).values(user_id=user.id, role_id=role.id))
    await session.execute(
        insert(role_permissions).values(role_id=role.id, permission_id=permission.id)
    )

    await session.execute(delete(Role).where(Role.id == role.id))

    assert await session.scalar(select(func.count()).select_from(user_roles)) == 0
    assert await session.scalar(select(func.count()).select_from(role_permissions)) == 0
    assert await session.scalar(select(func.count()).select_from(Permission)) == 1


async def test_the_relationships_carry_roles_and_permissions(session: AsyncSession) -> None:
    role = Role(name="viewer")
    role.permissions = [Permission(code="users.read"), Permission(code="audit.read")]
    user = make_user()
    user.roles = [role]
    session.add(user)
    await session.commit()

    loaded = (await session.scalars(select(User).where(User.email == "ada@example.com"))).one()
    assert [role.name for role in loaded.roles] == ["viewer"]
    assert sorted(p.code for p in loaded.roles[0].permissions) == ["audit.read", "users.read"]
