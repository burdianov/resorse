"""The audit trail: atomicity, redaction, correlation (F043).

The acceptance is "mutation/audit atomicity tests", and atomicity here is a
property of *one transaction*: ``record`` adds a row to the mutation's session
and never commits, so the two must stand or fall together. The tests attack it
from both sides:

- a **failed** mutation (duplicate email, escalation refusal) leaves **no**
  event — the rollback takes it;
- a **successful** mutation always leaves exactly one, with the sanitized
  diff the callers promise.

The redaction law is tested twice over: the canary scans (a generated
temporary password, a submitted password) must not appear anywhere in the
stored row, and ``record`` itself refuses credential-shaped keys — proven by
calling it directly, because that refusal is the mechanism the scans rely on.

Session lifecycle events are deliberately absent from this table (the sessions
rows are their own record); the F033/F035/F037/F039/F041 mutations are the
subjects here, one or two per family plus the two structural tests.
"""

import json
import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.csrf import CSRF_HEADER_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import AuditLog, Permission, Role, User
from app.services import audit as audit_service

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"
ADMIN = "/api/v1/admin"


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


async def sign_in(
    client: httpx.AsyncClient, session: AsyncSession, email: str = "root@example.com"
) -> User:
    user = await add_user(session, email=email, is_superuser=True)
    await session.commit()
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


async def events(session: AsyncSession) -> list[AuditLog]:
    return list(await session.scalars(select(AuditLog).order_by(AuditLog.created_at.asc())))


# --- atomicity ------------------------------------------------------------------


async def test_a_failed_mutation_leaves_no_event(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in(client, session)
    await client.post(ADMIN + "/users", json={"email": "taken@example.com", "full_name": "First"})
    assert len(await events(session)) == 1  # the successful create

    conflict = await client.post(
        ADMIN + "/users", json={"email": "taken@example.com", "full_name": "Second"}
    )
    assert conflict.status_code == 409

    # The rollback took the pending event with the failed insert — exactly one
    # story remains, and it is the one that happened.
    rows = await events(session)
    assert len(rows) == 1
    assert rows[0].action == "user.create"


async def test_a_successful_mutation_always_leaves_exactly_one_event(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in(client, session)
    created = await client.post(
        ADMIN + "/users", json={"email": "ada@example.com", "full_name": "Ada Lovelace"}
    )
    assert created.status_code == 201

    updated = await client.patch(
        f"{ADMIN}/users/{created.json()['user']['id']}", json={"full_name": "Ada Byron"}
    )
    assert updated.status_code == 200

    rows = await events(session)
    assert [row.action for row in rows] == ["user.create", "user.update"]
    update_row = rows[1]
    assert update_row.details == {
        "before": {"full_name": "Ada Lovelace"},
        "after": {"full_name": "Ada Byron"},
    }


# --- the vocabulary and the door -------------------------------------------------


async def test_record_refuses_credential_shaped_keys_anywhere(
    session: AsyncSession,
) -> None:
    actor = await add_user(session, email="root@example.com")

    with pytest.raises(audit_service.InvalidAuditEvent):
        await audit_service.record(
            session,
            actor=actor,
            action="user.update",
            entity_type="user",
            entity_id=actor.id,
            summary="Trying to leak.",
            details={"before": {"hashed_password": "argon2..."}},
        )
    with pytest.raises(audit_service.InvalidAuditEvent):
        await audit_service.record(
            session,
            actor=actor,
            action="user.update",
            entity_type="user",
            entity_id=actor.id,
            summary="Nested leak.",
            details={"changes": [{"Temporary_Password": "x"}]},  # case-insensitive
        )
    with pytest.raises(audit_service.InvalidAuditEvent):
        await audit_service.record(
            session,
            actor=actor,
            action="not.a.real.action",
            entity_type="user",
            entity_id=None,
            summary="Unknown action.",
        )
    # None of the refusals left a row (they raised before `add`), and the door
    # itself is why the canary scans in the other tests can be trusted.
    assert await events(session) == []


async def test_the_reset_password_event_never_carries_the_temporary(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in(client, session)
    target = await add_user(session, email="target@example.com")
    await session.commit()

    response = await client.post(f"{ADMIN}/users/{target.id}/reset-password")
    assert response.status_code == 200
    temporary = response.json()["temporary_password"]

    (row,) = await events(session)
    assert row.action == "user.reset_password"
    assert temporary not in json.dumps(row.details)
    assert temporary not in row.summary


async def test_a_submitted_password_never_reaches_the_trail(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in(client, session)
    secret_canary = "canary" + uuid.uuid4().hex

    created = await client.post(
        ADMIN + "/users",
        json={"email": "ada@example.com", "full_name": "Ada", "password": secret_canary},
    )
    assert created.status_code == 201

    (row,) = await events(session)
    assert secret_canary not in json.dumps(row.details)
    # The create event says *that* a credential was supplied, never which.
    assert row.details["temporary_password_generated"] is False


# --- the families: one event each, sanitized -------------------------------------


async def test_role_and_matrix_events_carry_sanitized_diffs(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    admin = await sign_in(client, session)
    await make_role(session, "auditor", [PermissionCode.AUDIT_READ])
    session.add(Permission(code=PermissionCode.SETTINGS_READ))
    await session.commit()

    created = await client.post(ADMIN + "/roles", json={"name": "reviewer", "permission_codes": []})
    assert created.status_code == 201, created.text
    saved = await client.put(
        f"{ADMIN}/roles/matrix",
        json={
            "roles": [
                {
                    "role_id": created.json()["id"],
                    "permission_codes": [PermissionCode.SETTINGS_READ],
                }
            ]
        },
    )
    assert saved.status_code == 204, saved.text

    rows = await events(session)
    by_action = {row.action: row for row in rows}
    assert by_action["role.create"].details["name"] == "reviewer"
    matrix = by_action["role.matrix_save"]
    assert matrix.details == {"changes": {"reviewer": {"before": [], "after": ["settings.read"]}}}
    assert matrix.actor_email == admin.email


async def test_settings_profile_and_preference_events(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in(client, session)

    settings = await client.put(
        f"{ADMIN}/settings", json={"branding.app_name": "Acme", "display.timezone": "UTC"}
    )
    assert settings.status_code == 200
    await client.patch("/api/v1/auth/me", json={"full_name": "Root Renamed"})
    await client.put("/api/v1/auth/me/preferences/theme.name", json={"value": "dark"})
    await client.delete("/api/v1/auth/me/preferences/theme.name")

    rows = await events(session)
    actions = [row.action for row in rows]
    assert actions == [
        "setting.update",
        "profile.update",
        "preference.set",
        "preference.delete",
    ]
    setting_row = rows[0]
    assert setting_row.details["changes"]["branding.app_name"] == {
        "before": "Application Platform",
        "after": "Acme",
    }
    # Preference events carry the key, never the value (personal display data).
    preference_row = rows[2]
    assert preference_row.details == {"key": "theme.name"}
    assert "dark" not in json.dumps(preference_row.details)


# --- the correlation id ----------------------------------------------------------


async def test_the_request_id_joins_the_response_and_the_event(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in(client, session)

    created = await client.post(
        ADMIN + "/users",
        json={"email": "ada@example.com", "full_name": "Ada"},
        headers={CSRF_HEADER_NAME: client.headers[CSRF_HEADER_NAME], "X-Request-Id": "req-42"},
    )

    assert created.status_code == 201
    assert created.headers["x-request-id"] == "req-42"
    (row,) = await events(session)
    assert row.correlation_id == "req-42"


async def test_a_hostile_request_id_is_replaced_not_reflected(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in(client, session)

    created = await client.post(
        ADMIN + "/users",
        json={"email": "ada@example.com", "full_name": "Ada"},
        headers={CSRF_HEADER_NAME: client.headers[CSRF_HEADER_NAME], "X-Request-Id": "bad id\n"},
    )

    assert created.status_code == 201
    echoed = created.headers["x-request-id"]
    assert echoed != "bad id\n"
    assert " " not in echoed and "\n" not in echoed  # a generated id, safe to echo
    (row,) = await events(session)
    assert row.correlation_id == echoed


async def test_service_level_events_have_no_request_id(session: AsyncSession) -> None:
    actor = await add_user(session, email="root@example.com")
    await audit_service.record(
        session,
        actor=actor,
        action="user.delete",
        entity_type="user",
        entity_id=actor.id,
        summary="No request here.",
    )
    await session.commit()

    (row,) = await events(session)
    # "No request" is a fact worth recording, not a gap to hide.
    assert row.correlation_id is None
    assert row.actor_email == "root@example.com"
