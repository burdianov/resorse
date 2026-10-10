"""Notifications: per-user CRUD, counts, safe links, and cross-user denial (F045).

The acceptance is "cross-user denial tests", and the file proves it the way
the design promises — two real users with real rows, each session seeing and
touching only its own, with foreign ids answering **404** (not 403: the
filter is (id AND user_id), so there is nothing to be forbidden from — a 403
would confirm the id exists).

The link rule is tested at both layers (the service refuses a URL or a
protocol-relative path; the database CHECK is the backstop), and the single
producer F045 wires — the admin password reset — is asserted end to end: the
target's inbox gains the notice inside the same transaction as the reset.
"""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import PASSWORD_CHANGE_REQUIRED_DETAIL, PERMISSION_DENIED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.csrf import CSRF_HEADER_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import Notification, Permission, Role, User
from app.services.notifications import InvalidNotification, notify

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"
INBOX = "/api/v1/notifications"


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


async def login(client: httpx.AsyncClient, email: str, password: str = PASSWORD) -> None:
    """Adopt a fresh session on the client (no user creation)."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
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


async def sign_in(
    client: httpx.AsyncClient,
    session: AsyncSession,
    email: str,
    codes: list[PermissionCode],
    **overrides: object,
) -> User:
    user = await add_user(session, email=email, **overrides)
    if codes:
        role = Role(name=f"role-{email}")
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
    await login(client, email)
    return user


def both_codes() -> list[PermissionCode]:
    return [PermissionCode.NOTIFICATIONS_READ, PermissionCode.NOTIFICATIONS_MANAGE_OWN]


async def give(
    session: AsyncSession,
    user: User,
    *,
    title: str,
    message: str = "Something happened.",
    link: str | None = None,
) -> Notification:
    row = await notify(session, user_id=user.id, title=title, message=message, link=link)
    await session.commit()
    return row


# --- guards ---------------------------------------------------------------------


async def test_the_inbox_requires_a_session_and_the_right_codes(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    assert (await client.get(INBOX)).status_code == 401

    # notifications.read only: reading works, mutating is the generic 403.
    await sign_in(client, session, "reader@example.com", [PermissionCode.NOTIFICATIONS_READ])
    assert (await client.get(INBOX)).status_code == 200
    denied = await client.post(f"{INBOX}/{uuid.uuid4()}/read")
    assert denied.status_code == 403
    assert denied.json()["detail"] == PERMISSION_DENIED_DETAIL


async def test_a_forced_change_gates_the_inbox(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await sign_in(client, session, "pending@example.com", [], must_change_password=True)
    assert user.must_change_password is True

    response = await client.get(INBOX)
    assert response.status_code == 403
    assert response.json()["detail"] == PASSWORD_CHANGE_REQUIRED_DETAIL


# --- the inbox lifecycle --------------------------------------------------------


async def test_list_serves_the_page_and_the_unread_count_newest_first(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await sign_in(client, session, "ada@example.com", both_codes())
    await give(session, user, title="First")
    await give(session, user, title="Second", link="/dashboard")

    response = await client.get(INBOX)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert body["unread_count"] == 2
    assert [item["title"] for item in body["items"]] == ["Second", "First"]  # newest first
    assert body["items"][0]["link"] == "/dashboard"
    assert body["items"][0]["is_read"] is False

    count = await client.get(f"{INBOX}/unread-count")
    assert count.json() == {"unread_count": 2}


async def test_mark_read_is_idempotent_for_the_owner_and_moves_the_count(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await sign_in(client, session, "ada@example.com", both_codes())
    row = await give(session, user, title="Hello")

    first = await client.post(f"{INBOX}/{row.id}/read")
    assert first.status_code == 200
    assert first.json()["is_read"] is True
    assert (await client.get(f"{INBOX}/unread-count")).json() == {"unread_count": 0}

    # The goal state already holds; the answer does not change.
    again = await client.post(f"{INBOX}/{row.id}/read")
    assert again.status_code == 200
    assert again.json()["is_read"] is True


async def test_read_all_and_clear_all_report_their_counts(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await sign_in(client, session, "ada@example.com", both_codes())
    for index in range(3):
        await give(session, user, title=f"Notice {index}")

    read_all = await client.post(f"{INBOX}/read-all")
    assert read_all.status_code == 200
    assert read_all.json() == {"updated": 3}
    assert (await client.get(f"{INBOX}/unread-count")).json() == {"unread_count": 0}

    cleared = await client.delete(INBOX)
    assert cleared.status_code == 200
    assert cleared.json() == {"deleted": 3}
    assert (await client.get(INBOX)).json()["total"] == 0
    # Idempotent bulk: an empty inbox clears to zero, not to an error.
    assert (await client.delete(INBOX)).json() == {"deleted": 0}


async def test_delete_one_answers_404_once_it_is_gone(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await sign_in(client, session, "ada@example.com", both_codes())
    row = await give(session, user, title="Hello")

    assert (await client.delete(f"{INBOX}/{row.id}")).status_code == 204
    # Not idempotent like preferences: a notice is an entity, and "it is not
    # there" is the honest answer the second time too.
    assert (await client.delete(f"{INBOX}/{row.id}")).status_code == 404


# --- the acceptance: cross-user denial ------------------------------------------


async def test_one_users_inbox_is_invisible_and_untouchable_to_another(
    make_client, session: AsyncSession
) -> None:
    ada_client = await make_client("192.0.2.81")
    grace_client = await make_client("192.0.2.82")
    ada = await sign_in(ada_client, session, "ada@example.com", both_codes())
    grace = await sign_in(grace_client, session, "grace@example.com", both_codes())
    ada_row = await give(session, ada, title="Ada's notice")
    await give(session, grace, title="Grace's notice")

    # Lists and counts are per-user.
    ada_list = (await ada_client.get(INBOX)).json()
    assert [item["title"] for item in ada_list["items"]] == ["Ada's notice"]
    assert ada_list["unread_count"] == 1
    grace_list = (await grace_client.get(INBOX)).json()
    assert [item["title"] for item in grace_list["items"]] == ["Grace's notice"]

    # Foreign ids are NOT FOUND — never forbidden (a 403 would confirm the id).
    read = await grace_client.post(f"{INBOX}/{ada_row.id}/read")
    assert read.status_code == 404
    assert read.json()["detail"] == "Notification not found."
    deleted = await grace_client.delete(f"{INBOX}/{ada_row.id}")
    assert deleted.status_code == 404

    # Bulk operations are scoped the same way.
    marked = await grace_client.post(f"{INBOX}/read-all")
    assert marked.json() == {"updated": 1}  # Grace's own only
    ada_refreshed = await session.scalar(
        select(Notification)
        .where(Notification.id == ada_row.id)
        .execution_options(populate_existing=True)
    )
    assert ada_refreshed is not None and ada_refreshed.is_read is False

    cleared = await grace_client.delete(INBOX)
    assert cleared.json() == {"deleted": 1}
    survivors = list(await session.scalars(select(Notification)))
    assert [row.id for row in survivors] == [ada_row.id]


# --- safe links -----------------------------------------------------------------


async def test_the_link_must_be_an_internal_path(session: AsyncSession) -> None:
    user = await add_user(session, email="ada@example.com")

    for bad in (
        "https://evil.example/x",
        "//evil.example",
        "/",
        "/\\evil",
        "/%2Fevil",
        "dashboard",
    ):
        with pytest.raises(InvalidNotification):
            await notify(session, user_id=user.id, title="T", message="M", link=bad)

    for bad_title in ("", "   "):
        with pytest.raises(InvalidNotification):
            await notify(session, user_id=user.id, title=bad_title, message="M")

    # The good shape stores.
    ok = await notify(session, user_id=user.id, title="T", message="M", link="/profile")
    await session.commit()
    assert ok.link == "/profile"

    # The database CHECK is the backstop for writers the service never sees.
    session.add(Notification(user_id=user.id, title="T", message="M", link="//evil.example"))
    with pytest.raises(IntegrityError) as caught:
        await session.flush()
    assert "ck_notifications_link_is_an_internal_path" in str(caught.value.orig)
    await session.rollback()


# --- the one producer (C34) ------------------------------------------------------


async def test_a_password_reset_notifies_its_target_in_the_same_transaction(
    make_client, session: AsyncSession
) -> None:
    admin_client = await make_client("192.0.2.91")
    target_client = await make_client("192.0.2.92")
    admin = await sign_in(
        admin_client, session, "root@example.com", [PermissionCode.USERS_RESET_PASSWORD]
    )
    target = await sign_in(target_client, session, "ada@example.com", both_codes())

    reset = await admin_client.post(f"/api/v1/admin/users/{target.id}/reset-password")
    assert reset.status_code == 200

    # The reset revoked every session of the target (F030, by design) and
    # re-armed the forced change — so the inbox is gated (C30) until the
    # target signs in with the temporary and sets their own password.
    temporary = reset.json()["temporary_password"]
    await login(target_client, "ada@example.com", temporary)
    assert (await target_client.get(INBOX)).status_code == 403  # the flag gate
    changed = await target_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": temporary, "new_password": "ada chose this passphrase"},
    )
    assert changed.status_code == 204, changed.text
    # The change rotated the session (F030) — adopt the fresh cookie pair, or
    # the next request replays the superseded id and trips the family kill.
    fresh = next(
        header
        for header in changed.headers.get_list("set-cookie")
        if header.startswith(f"{SESSION_COOKIE_NAME}=")
    )
    fresh_csrf = next(
        header
        for header in changed.headers.get_list("set-cookie")
        if header.startswith(f"{CSRF_COOKIE_NAME}=")
    )
    target_client.cookies.clear()
    target_client.cookies.update(
        {
            SESSION_COOKIE_NAME: fresh.split("=", 1)[1].split(";", 1)[0],
            CSRF_COOKIE_NAME: fresh_csrf.split("=", 1)[1].split(";", 1)[0],
        }
    )

    response = await target_client.get(INBOX)
    assert response.status_code == 200, response.text
    inbox = response.json()
    assert inbox["unread_count"] == 1
    (notice,) = inbox["items"]
    assert notice["title"] == "Your password was reset"
    assert notice["link"] == "/change-password"
    assert notice["is_read"] is False
    assert admin.id != target.id  # the producer wrote to the TARGET, not the actor
