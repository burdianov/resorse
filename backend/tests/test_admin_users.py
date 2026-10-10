"""The admin user directory, end to end (F033).

The acceptance is "CRUD and privilege tests", and the privilege half is the
heavier one: who may touch whom, what a role grant may contain, which flags
nobody may change about themselves, and the one account the platform refuses
to lose. Every test drives the **real** application over the ASGI transport
(the F028/F029 fixtures), so the guards under test are the guards that ship:
F031's `require_permission` on the router, the CSRF middleware on every
unsafe method, and the service's business rules behind both.

Setup pattern: a *caller* is a real user holding a real role whose codes are
exactly the ones the test wants it to have — never a superuser unless the
test is about superusers, because the subset rule makes a superuser able to
do everything, which would hide the refusals.
"""

import uuid

import httpx
import pytest
from conftest import ClientFactory
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import PERMISSION_DENIED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password, hash_session_token, verify_password
from app.models import Permission, Role, User, UserSession

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

PASSWORD = "correct horse battery staple"
CALLER_EMAIL = "admin@example.com"
USERS_API = "/api/v1/admin/users"


# --- helpers -----------------------------------------------------------------


async def add_user(
    session: AsyncSession,
    *,
    email: str,
    full_name: str | None = None,
    password: str = PASSWORD,
    **overrides: object,
) -> User:
    user = User(
        email=email,
        full_name=full_name if full_name is not None else email.split("@")[0].title(),
        hashed_password=hash_password(password),
        roles=[],
        **overrides,
    )
    session.add(user)
    await session.flush()
    return user


async def make_role(session: AsyncSession, name: str, codes: list[PermissionCode]) -> Role:
    """A role holding exactly ``codes`` (the ``no_autoflush`` pattern of
    `test_authorization.py`: pending objects append purely in memory)."""
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


def adopt_session(client: httpx.AsyncClient, token: str, csrf: str) -> None:
    """Point the client at this session: both cookies in the jar and the
    double-submit header on every request (the middleware refuses mutating
    requests without it — the frontend's interceptor does exactly this)."""
    client.cookies.clear()
    client.cookies.update({SESSION_COOKIE_NAME: token, CSRF_COOKIE_NAME: csrf})
    client.headers[CSRF_HEADER_NAME] = csrf


async def login(client: httpx.AsyncClient, email: str, password: str = PASSWORD) -> tuple[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200, response.text
    return (
        cookie_value(one_cookie(response, SESSION_COOKIE_NAME)),
        cookie_value(one_cookie(response, CSRF_COOKIE_NAME)),
    )


async def caller_with(
    client: httpx.AsyncClient,
    session: AsyncSession,
    codes: list[PermissionCode],
    *,
    email: str = CALLER_EMAIL,
    superuser: bool = False,
) -> httpx.AsyncClient:
    """The caller signs in and its jar carries the session + CSRF pair."""
    user = await add_user(session, email=email, is_superuser=superuser)
    if codes:
        role = await make_role(session, f"role:{email}", codes)
        user.roles.append(role)
    await session.commit()
    token, csrf = await login(client, email)
    adopt_session(client, token, csrf)
    return client


async def session_row_for(session: AsyncSession, token: str) -> UserSession:
    row = await session.scalar(
        select(UserSession)
        .where(UserSession.token_hash == hash_session_token(token))
        .execution_options(populate_existing=True),
    )
    assert row is not None
    return row


async def reload_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.scalar(
        select(User).where(User.id == user_id).execution_options(populate_existing=True)
    )
    assert user is not None
    return user


# --- session + permission guards ----------------------------------------------


async def test_every_admin_endpoint_requires_a_session(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await session.commit()

    replies = [
        await client.get(USERS_API),
        await client.post(USERS_API, json={"email": "x@example.com", "full_name": "X"}),
        await client.get(f"{USERS_API}/{target.id}"),
        await client.patch(f"{USERS_API}/{target.id}", json={"full_name": "Y"}),
        await client.post(f"{USERS_API}/{target.id}/reset-password"),
        await client.delete(f"{USERS_API}/{target.id}"),
    ]
    for response in replies:
        assert response.status_code == 401, response.text


async def test_each_endpoint_requires_its_own_permission(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await session.commit()
    # The caller holds users.read ONLY: reading works, every mutation refuses
    # with the one generic permission message (F031), and nothing changes.
    await caller_with(client, session, [PermissionCode.USERS_READ])

    assert (await client.get(USERS_API)).status_code == 200
    assert (await client.get(f"{USERS_API}/{target.id}")).status_code == 200

    replies = [
        await client.post(USERS_API, json={"email": "new@example.com", "full_name": "New"}),
        await client.patch(f"{USERS_API}/{target.id}", json={"full_name": "Changed"}),
        await client.post(f"{USERS_API}/{target.id}/reset-password"),
        await client.delete(f"{USERS_API}/{target.id}"),
    ]
    for response in replies:
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == PERMISSION_DENIED_DETAIL

    refreshed = await reload_user(session, target.id)
    assert refreshed.full_name == "Target" and refreshed.is_active is True


# --- create -------------------------------------------------------------------


async def test_create_returns_a_generated_temporary_password_once(
    make_client: ClientFactory, session: AsyncSession
) -> None:
    client = await make_client()
    await caller_with(client, session, [PermissionCode.USERS_CREATE, PermissionCode.USERS_READ])

    response = await client.post(
        USERS_API, json={"email": "ada@example.com", "full_name": "Ada Lovelace"}
    )

    assert response.status_code == 201, response.text
    body = response.json()
    temporary = body["temporary_password"]
    assert isinstance(temporary, str) and len(temporary) >= 12
    assert body["user"]["email"] == "ada@example.com"
    assert body["user"]["must_change_password"] is True
    assert body["user"]["roles"] == []

    created = await session.scalar(select(User).where(User.email == "ada@example.com"))
    assert created is not None
    assert verify_password(temporary, created.hashed_password) is True

    # The temporary works once, as a forced-change sign-in…
    target_client = await make_client("192.0.2.50")
    token, _ = await login(target_client, "ada@example.com", temporary)
    assert token

    # …and no directory response ever repeats it.
    listing = await client.get(USERS_API, params={"search": "ada@example.com"})
    assert temporary not in listing.text


async def test_create_with_an_explicit_password_and_policy_refusals(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await caller_with(client, session, [PermissionCode.USERS_CREATE])

    refused = await client.post(
        USERS_API,
        json={"email": "weak@example.com", "full_name": "Weak", "password": "password123"},
    )
    assert refused.status_code == 422
    entries = refused.json()["detail"]
    assert entries and all(entry["loc"] == ["body", "password"] for entry in entries)
    assert all("input" not in entry for entry in entries)
    assert "password123" not in refused.text
    assert await session.scalar(select(User).where(User.email == "weak@example.com")) is None

    accepted = await client.post(
        USERS_API,
        json={
            "email": "strong@example.com",
            "full_name": "Strong",
            "password": "a deliberately chosen passphrase",
        },
    )
    assert accepted.status_code == 201
    # The admin supplied it; the response does not echo it back.
    assert accepted.json()["temporary_password"] is None
    created = await session.scalar(select(User).where(User.email == "strong@example.com"))
    assert created is not None
    assert verify_password("a deliberately chosen passphrase", created.hashed_password) is True


async def test_create_canonicalizes_email_and_refuses_duplicates(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session, email="taken@example.com")
    await session.commit()
    await caller_with(client, session, [PermissionCode.USERS_CREATE])

    created = await client.post(
        USERS_API, json={"email": "  Ada@Example.COM  ", "full_name": "Ada"}
    )
    assert created.status_code == 201
    assert created.json()["user"]["email"] == "ada@example.com"

    duplicate = await client.post(
        USERS_API, json={"email": "ADA@example.com", "full_name": "Ada Again"}
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "A user with this email address already exists."

    existing = await client.post(
        USERS_API, json={"email": "taken@example.com", "full_name": "Taken"}
    )
    assert existing.status_code == 409


async def test_create_rejects_unknown_roles(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await caller_with(client, session, [PermissionCode.USERS_CREATE])

    response = await client.post(
        USERS_API,
        json={"email": "ada@example.com", "full_name": "Ada", "role_ids": [str(uuid.uuid4())]},
    )

    assert response.status_code == 422
    (entry,) = response.json()["detail"]
    assert entry["loc"] == ["body", "role_ids"]


# --- list ---------------------------------------------------------------------


async def test_list_paginates_searches_filters_and_sorts(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    for index in range(1, 6):
        await add_user(
            session,
            email=f"user{index}@example.com",
            full_name=f"User {index}",
            is_active=index != 3,
        )
    deleted = await add_user(session, email="user0@example.com", full_name="User 0")
    deleted.is_deleted = True
    deleted.is_active = False
    await session.commit()
    await caller_with(client, session, [PermissionCode.USERS_READ])

    # The caller is in the directory too; `search` scopes every assertion to
    # the seeded family so the counts are exact.
    first_page = await client.get(
        USERS_API, params={"search": "user", "page_size": 2, "sort": "email", "order": "asc"}
    )
    body = first_page.json()
    assert body["total"] == 5  # user0 is deleted: audit material, not a row
    assert [item["email"] for item in body["items"]] == ["user1@example.com", "user2@example.com"]

    second_page = await client.get(
        USERS_API,
        params={"search": "user", "page_size": 2, "page": 2, "sort": "email", "order": "asc"},
    )
    assert [item["email"] for item in second_page.json()["items"]] == [
        "user3@example.com",
        "user4@example.com",
    ]

    descending = await client.get(
        USERS_API, params={"search": "user", "page_size": 2, "sort": "email", "order": "desc"}
    )
    assert [item["email"] for item in descending.json()["items"]] == [
        "user5@example.com",
        "user4@example.com",
    ]

    inactive = await client.get(
        USERS_API, params={"search": "user", "is_active": False, "page_size": 10}
    )
    assert [item["email"] for item in inactive.json()["items"]] == ["user3@example.com"]

    # Case-insensitive over both columns; a wildcard is a character, not a
    # pattern (the escape test — `%` matches no seeded name).
    by_name = await client.get(USERS_API, params={"search": "USER 5"})
    assert [item["email"] for item in by_name.json()["items"]] == ["user5@example.com"]
    wildcard = await client.get(USERS_API, params={"search": "%"})
    assert wildcard.json()["total"] == 0


# --- update -------------------------------------------------------------------


async def test_patch_edits_fields_and_replaces_roles(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    old_role = await make_role(session, "old-role", [PermissionCode.SETTINGS_READ])
    new_role = await make_role(session, "new-role", [PermissionCode.SETTINGS_READ])
    target.roles.append(old_role)
    await session.commit()
    await caller_with(client, session, [PermissionCode.USERS_UPDATE, PermissionCode.SETTINGS_READ])

    response = await client.patch(
        f"{USERS_API}/{target.id}",
        json={
            "full_name": "  Ada Lovelace  ",
            "phone": "+971 50 123 4567",
            "email": "Ada.New@Example.COM",
            "role_ids": [str(new_role.id)],
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["full_name"] == "Ada Lovelace"  # trimmed
    assert body["phone"] == "+971 50 123 4567"
    assert body["email"] == "ada.new@example.com"  # canonicalised
    assert [role["id"] for role in body["roles"]] == [str(new_role.id)]

    refreshed = await reload_user(session, target.id)
    assert [role.id for role in refreshed.roles] == [new_role.id]  # replaced, not merged


async def test_patch_rejects_an_empty_edit(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await session.commit()
    await caller_with(client, session, [PermissionCode.USERS_UPDATE])

    response = await client.patch(f"{USERS_API}/{target.id}", json={})

    assert response.status_code == 400
    assert response.json()["detail"] == "No changes were submitted."


async def test_patch_refuses_conflicts_and_unknown_roles(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await add_user(session, email="other@example.com")
    await session.commit()
    await caller_with(client, session, [PermissionCode.USERS_UPDATE])
    # The conflict path rolls the request's transaction back (the unique index
    # answered), which expires every object in the shared test session — so the
    # id is captured now, while it is loaded (the F031 lesson, same shape).
    target_id = target.id

    conflict = await client.patch(f"{USERS_API}/{target_id}", json={"email": "other@example.com"})
    assert conflict.status_code == 409

    unknown = await client.patch(f"{USERS_API}/{target_id}", json={"role_ids": [str(uuid.uuid4())]})
    assert unknown.status_code == 422
    assert unknown.json()["detail"][0]["loc"] == ["body", "role_ids"]


async def test_the_active_toggle_needs_its_own_permission(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await session.commit()
    # users.update without users.deactivate: name edits pass, the lifecycle
    # toggle refuses with the generic permission message.
    await caller_with(client, session, [PermissionCode.USERS_UPDATE])

    refused = await client.patch(f"{USERS_API}/{target.id}", json={"is_active": False})
    assert refused.status_code == 403
    assert refused.json()["detail"] == PERMISSION_DENIED_DETAIL

    allowed = await client.patch(f"{USERS_API}/{target.id}", json={"full_name": "Renamed"})
    assert allowed.status_code == 200


async def test_deactivation_revokes_sessions_and_blocks_sign_in(
    make_client: ClientFactory, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await session.commit()
    target_client = await make_client("192.0.2.60")
    target_token, _ = await login(target_client, "target@example.com")

    client = await make_client()
    await caller_with(
        client, session, [PermissionCode.USERS_UPDATE, PermissionCode.USERS_DEACTIVATE]
    )
    response = await client.patch(f"{USERS_API}/{target.id}", json={"is_active": False})
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    # Every session of the target is over, reason `admin` (BP-6.1)…
    assert (await session_row_for(session, target_token)).revoked_reason == "admin"
    # …and the credential stops working until reactivation.
    denied = await target_client.post(
        "/api/v1/auth/login",
        json={"email": "target@example.com", "password": PASSWORD},
        headers={"Origin": "http://localhost:5173"},
    )
    assert denied.status_code == 401

    reactivated = await client.patch(f"{USERS_API}/{target.id}", json={"is_active": True})
    assert reactivated.status_code == 200
    fresh_token, _ = await login(target_client, "target@example.com")
    assert fresh_token


# --- delete -------------------------------------------------------------------


async def test_delete_is_soft_keeps_the_row_and_closes_the_account(
    make_client: ClientFactory, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await session.commit()
    target_client = await make_client("192.0.2.61")
    target_token, _ = await login(target_client, "target@example.com")

    client = await make_client()
    await caller_with(
        client,
        session,
        [PermissionCode.USERS_READ, PermissionCode.USERS_CREATE, PermissionCode.USERS_DEACTIVATE],
    )
    response = await client.delete(f"{USERS_API}/{target.id}")

    assert response.status_code == 204
    refreshed = await reload_user(session, target.id)
    # The row survives for audit; the account does not survive for anyone else.
    assert refreshed.is_deleted is True and refreshed.is_active is False
    assert (await session_row_for(session, target_token)).revoked_reason == "admin"

    assert (await client.get(f"{USERS_API}/{target.id}")).status_code == 404
    listing = await client.get(USERS_API, params={"search": "target@example.com"})
    assert listing.json()["total"] == 0
    denied = await target_client.post(
        "/api/v1/auth/login",
        json={"email": "target@example.com", "password": PASSWORD},
        headers={"Origin": "http://localhost:5173"},
    )
    assert denied.status_code == 401

    # The email stays occupied: an account is never silently reborn.
    recreate = await client.post(
        USERS_API, json={"email": "target@example.com", "full_name": "Target Two"}
    )
    assert recreate.status_code == 409


async def test_self_changes_are_limited_to_profile_fields(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    caller = await add_user(session, email=CALLER_EMAIL)
    role = await make_role(
        session,
        "self-admin",
        [PermissionCode.USERS_UPDATE, PermissionCode.USERS_DEACTIVATE],
    )
    caller.roles.append(role)
    await session.commit()
    token, csrf = await login(client, CALLER_EMAIL)
    adopt_session(client, token, csrf)

    profile = await client.patch(f"{USERS_API}/{caller.id}", json={"full_name": "Renamed Self"})
    assert profile.status_code == 200

    roles = await client.patch(f"{USERS_API}/{caller.id}", json={"role_ids": []})
    assert roles.status_code == 403
    assert roles.json()["detail"] == "You cannot change your own roles or account status."

    deactivate = await client.patch(f"{USERS_API}/{caller.id}", json={"is_active": False})
    assert deactivate.status_code == 403

    deletion = await client.delete(f"{USERS_API}/{caller.id}")
    assert deletion.status_code == 403
    assert deletion.json()["detail"] == "You cannot delete your own account."


# --- privilege rules ----------------------------------------------------------


async def test_superusers_are_managed_by_superusers_only(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="super@example.com", is_superuser=True)
    await session.commit()
    await caller_with(
        client,
        session,
        [
            PermissionCode.USERS_UPDATE,
            PermissionCode.USERS_CREATE,
            PermissionCode.USERS_DEACTIVATE,
            PermissionCode.USERS_RESET_PASSWORD,
        ],
    )

    replies = [
        await client.patch(f"{USERS_API}/{target.id}", json={"full_name": "Nope"}),
        await client.delete(f"{USERS_API}/{target.id}"),
        await client.post(f"{USERS_API}/{target.id}/reset-password"),
        # Creating one is the same rule.
        await client.post(
            USERS_API, json={"email": "super2@example.com", "full_name": "S2", "is_superuser": True}
        ),
    ]
    for response in replies:
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == "Only a super-admin can manage a super-admin account."


async def test_the_last_superuser_cannot_be_deactivated_or_deleted(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    caller = await add_user(session, email=CALLER_EMAIL, is_superuser=True)
    second = await add_user(session, email="second-super@example.com", is_superuser=True)
    await session.commit()
    token, csrf = await login(client, CALLER_EMAIL)
    adopt_session(client, token, csrf)

    # While two supers exist, one may be deactivated…
    deactivated = await client.patch(f"{USERS_API}/{second.id}", json={"is_active": False})
    assert deactivated.status_code == 200

    # …then the surviving one is untouchable — by themselves first of all.
    last = await client.patch(f"{USERS_API}/{caller.id}", json={"is_active": False})
    assert last.status_code == 409
    assert "last active super-admin" in last.json()["detail"]
    deletion = await client.delete(f"{USERS_API}/{caller.id}")
    assert deletion.status_code == 409

    # Reactivation restores the safe state.
    reactivated = await client.patch(f"{USERS_API}/{second.id}", json={"is_active": True})
    assert reactivated.status_code == 200


async def test_role_grants_cannot_exceed_the_callers_own_permissions(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    powerful = await make_role(session, "powerful", [PermissionCode.ROLES_MANAGE])
    within = await make_role(session, "within", [PermissionCode.SETTINGS_READ])
    await session.commit()
    # The caller holds settings.read — so `within` is grantable and `powerful`
    # is not, even though the caller may edit users at all.
    await caller_with(
        client,
        session,
        [
            PermissionCode.USERS_UPDATE,
            PermissionCode.USERS_CREATE,
            PermissionCode.SETTINGS_READ,
        ],
    )

    escalation = await client.patch(
        f"{USERS_API}/{target.id}", json={"role_ids": [str(powerful.id)]}
    )
    assert escalation.status_code == 403
    assert (
        escalation.json()["detail"]
        == "You cannot grant a role that includes permissions you do not hold."
    )

    accepted = await client.patch(f"{USERS_API}/{target.id}", json={"role_ids": [str(within.id)]})
    assert accepted.status_code == 200

    create_escalation = await client.post(
        USERS_API,
        json={"email": "new@example.com", "full_name": "New", "role_ids": [str(powerful.id)]},
    )
    assert create_escalation.status_code == 403


async def test_a_superuser_can_grant_what_a_plain_admin_cannot(
    make_client: ClientFactory, session: AsyncSession
) -> None:
    famous = await make_role(session, "famous", [PermissionCode.ROLES_MANAGE])
    await session.commit()

    client = await make_client()
    await caller_with(client, session, [], email="root@example.com", superuser=True)

    response = await client.post(
        USERS_API,
        json={"email": "granted@example.com", "full_name": "Granted", "role_ids": [str(famous.id)]},
    )

    assert response.status_code == 201, response.text
    assert [role["name"] for role in response.json()["user"]["roles"]] == ["famous"]


# --- reset --------------------------------------------------------------------


async def test_reset_endpoint_returns_a_temporary_that_forces_change(
    make_client: ClientFactory, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await session.commit()
    target_client = await make_client("192.0.2.62")
    target_token, _ = await login(target_client, "target@example.com")

    client = await make_client()
    await caller_with(client, session, [PermissionCode.USERS_RESET_PASSWORD])
    response = await client.post(f"{USERS_API}/{target.id}/reset-password")

    assert response.status_code == 200, response.text
    temporary = response.json()["temporary_password"]
    refreshed = await reload_user(session, target.id)
    assert verify_password(temporary, refreshed.hashed_password) is True
    assert verify_password(PASSWORD, refreshed.hashed_password) is False
    assert refreshed.must_change_password is True
    assert refreshed.password_reset_at is not None
    assert (await session_row_for(session, target_token)).revoked_reason == "admin"

    # The recovery path works end to end: the temporary signs in, flagged.
    token, _ = await login(target_client, "target@example.com", temporary)
    assert token


async def test_no_response_ever_carries_the_stored_hash(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    target = await add_user(session, email="target@example.com")
    await session.commit()
    await caller_with(
        client,
        session,
        [PermissionCode.USERS_READ, PermissionCode.USERS_CREATE],
    )

    replies = [
        await client.get(USERS_API),
        await client.post(USERS_API, json={"email": "ada@example.com", "full_name": "Ada"}),
        await client.get(f"{USERS_API}/{target.id}"),
    ]

    for response in replies:
        assert "argon2" not in response.text
        assert "hashed_password" not in response.text
