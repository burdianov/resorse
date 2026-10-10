"""The password lifecycle — self-change and admin reset (F030).

Two layers, both real:

- **Service-level tests** drive ``app/services/passwords.py`` with an
  explicit clock (every function takes ``now=``), so throttling windows,
  ``password_reset_at`` and the inherited deadlines are exact.
- **HTTP tests** drive ``POST /api/v1/auth/change-password`` through the
  real application with the F029 fixtures (jar cookies, CSRF double-submit
  headers), because the endpoint's shape *is* part of the contract: 204 with
  a rotated cookie pair, or a field-addressable 422 that a form can map onto
  its inputs.

The acceptance is "old sessions invalid tests", so the centre of gravity is
test 4: a changed credential must rotate the session that asked, end every
*other* session (`password_change`), update the hash, clear the forced-change
flag — in one unit of work — and a reset must end *everything* (`admin`)
while installing a temporary credential that itself passes the policy.

One deliberate omission: the tests never re-present the *rotated predecessor*
to the resolver. F029 already pins that a superseded ID is a replay; doing it
here would revoke the very family the test just minted, through a path this
task does not own.
"""

from datetime import UTC, datetime, timedelta, tzinfo

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import PASSWORD_RATE_LIMITED_DETAIL
from app.api.v1.dependencies import NOT_AUTHENTICATED_DETAIL
from app.core.config import get_settings
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.csrf import TOKEN_DETAIL
from app.core.rate_limit import password_key
from app.core.security import (
    hash_password,
    hash_session_token,
    password_needs_rehash,
    password_policy_violations,
    verify_password,
)
from app.models import User, UserSession
from app.models.rate_limit import RateLimitBucket
from app.services.auth import IssuedSession, log_in
from app.services.passwords import (
    SAME_AS_CURRENT_VIOLATION,
    InvalidCurrentPassword,
    PasswordPolicyViolation,
    PasswordRateLimited,
    change_password,
    reset_password,
)
from app.services.sessions import SessionContext, resolve_session

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

EMAIL = "ada@example.com"
OTHER_EMAIL = "grace@example.com"
STRONG_PASSWORD = "correct horse battery staple"
NEW_PASSWORD = "a fresh correct horse battery staple"
CLIENT_IP = "203.0.113.7"

# A fixed, epoch-aligned "present" — the same instant F028's suite freezes at
# (12:00 starts a 15-minute rate-limit window; Retry-After is the full 900).
T0 = datetime(2026, 10, 10, 12, 0, 0, tzinfo=UTC)
IDLE = timedelta(hours=12)
ABSOLUTE = timedelta(days=30)

# The origin a browser would claim (the same value the middleware enforces).
GOOD_ORIGIN = next(iter(get_settings().trusted_origins), "http://localhost:5173")


@pytest.fixture(autouse=True)
def frozen_password_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Freeze the *passwords service'* view of the clock.

    Service-level tests pass ``now=`` explicitly and are unaffected; the HTTP
    tests cannot, and the throttling test needs the exact ``Retry-After`` —
    a suite that straddles a rate-limit window boundary flakes (F028's rule).
    Only ``app.services.passwords`` is patched; the other services read the
    real clock, and nothing in this file asserts on their instants.
    """

    class FrozenDateTime(datetime):
        # `datetime.now` returns `Self`; this double deliberately returns the
        # frozen instant as a plain `datetime`, which `Self` cannot express.
        @classmethod
        def now(cls, tz: tzinfo | None = None) -> datetime:  # type: ignore[override]
            if tz is None:
                return T0.replace(tzinfo=None)
            return T0.astimezone(tz)

    monkeypatch.setattr("app.services.passwords.datetime", FrozenDateTime)


# --- helpers -----------------------------------------------------------------


async def add_user(session: AsyncSession, *, email: str = EMAIL, **overrides: object) -> User:
    user = User(
        email=email,
        full_name="Ada Lovelace",
        hashed_password=hash_password(STRONG_PASSWORD),
        **overrides,
    )
    session.add(user)
    await session.flush()
    return user


async def log_in_via_service(
    session: AsyncSession,
    *,
    email: str = EMAIL,
    now: datetime = T0,
    password: str = STRONG_PASSWORD,
) -> IssuedSession:
    return await log_in(session, email=email, password=password, client_ip=CLIENT_IP, now=now)


async def context_for(session: AsyncSession, token: str, *, now: datetime = T0) -> SessionContext:
    context = await resolve_session(session, token, now=now)
    assert context is not None
    return context


async def row_for(session: AsyncSession, token: str) -> UserSession:
    row = await session.scalar(
        select(UserSession)
        .where(UserSession.token_hash == hash_session_token(token))
        .execution_options(populate_existing=True),
    )
    assert row is not None
    return row


async def bucket_row(session: AsyncSession, key: str) -> RateLimitBucket | None:
    return await session.scalar(select(RateLimitBucket).where(RateLimitBucket.bucket_key == key))


def one_cookie(response: httpx.Response, name: str) -> str:
    matches = [h for h in response.headers.get_list("set-cookie") if h.startswith(f"{name}=")]
    assert len(matches) == 1, matches
    return matches[0]


def cookie_value(header: str) -> str:
    return header.split("=", 1)[1].split(";", 1)[0].strip('"')


def as_cookies(client: httpx.AsyncClient, cookies: dict[str, str]) -> None:
    """Point the client's jar at exactly these cookies for the next request
    (the F029 pattern; httpx deprecates the per-request form)."""
    client.cookies.clear()
    client.cookies.update(cookies)


def session_cookies(token: str, csrf: str) -> dict[str, str]:
    return {SESSION_COOKIE_NAME: token, CSRF_COOKIE_NAME: csrf}


def csrf_headers(csrf: str) -> dict[str, str]:
    return {"Origin": GOOD_ORIGIN, "X-CSRF-Token": csrf}


async def login(
    client: httpx.AsyncClient, *, email: str = EMAIL, password: str = STRONG_PASSWORD
) -> tuple[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"Origin": GOOD_ORIGIN},
    )
    assert response.status_code == 200, response.text
    return (
        cookie_value(one_cookie(response, SESSION_COOKIE_NAME)),
        cookie_value(one_cookie(response, CSRF_COOKIE_NAME)),
    )


async def change_over_http(
    client: httpx.AsyncClient,
    *,
    token: str,
    csrf: str,
    current: str = STRONG_PASSWORD,
    new: str = NEW_PASSWORD,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    as_cookies(client, session_cookies(token, csrf))
    return await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": current, "new_password": new},
        headers=csrf_headers(csrf) if headers is None else headers,
    )


# --- self-change (service level) ----------------------------------------------


async def test_a_wrong_current_password_is_refused_and_changes_nothing(
    session: AsyncSession,
) -> None:
    user = await add_user(session)
    issued = await log_in_via_service(session)
    context = await context_for(session, issued.token)

    with pytest.raises(InvalidCurrentPassword):
        await change_password(
            session, context, current_password="not the password", new_password=NEW_PASSWORD, now=T0
        )

    row = await row_for(session, issued.token)
    assert verify_password(STRONG_PASSWORD, user.hashed_password) is True
    assert user.password_reset_at is None
    assert user.must_change_password is False
    assert row.revoked_at is None  # nothing was revoked, nothing rotated


async def test_the_new_password_must_pass_the_policy_with_the_users_own_email(
    session: AsyncSession,
) -> None:
    user = await add_user(session)
    issued = await log_in_via_service(session)
    context = await context_for(session, issued.token)
    stored = user.hashed_password

    with pytest.raises(PasswordPolicyViolation) as short:
        await change_password(
            session, context, current_password=STRONG_PASSWORD, new_password="short"
        )
    assert any("at least" in message for message in short.value.violations)

    # The email rule needs the *stored* address — which is why the policy runs
    # in the service and not in the request schema (the body cannot know it).
    with pytest.raises(PasswordPolicyViolation) as email_rule:
        await change_password(
            session, context, current_password=STRONG_PASSWORD, new_password=EMAIL
        )
    assert email_rule.value.violations == [
        "This password is based on the email address; choose another."
    ]
    # The violation report never contains the candidate (F026's rule).
    assert EMAIL not in " ".join(email_rule.value.violations)

    assert user.hashed_password == stored


async def test_the_new_password_must_differ_from_the_current_one(session: AsyncSession) -> None:
    user = await add_user(session)
    issued = await log_in_via_service(session)
    context = await context_for(session, issued.token)
    stored = user.hashed_password

    with pytest.raises(PasswordPolicyViolation) as caught:
        await change_password(
            session, context, current_password=STRONG_PASSWORD, new_password=STRONG_PASSWORD
        )

    assert caught.value.violations == [SAME_AS_CURRENT_VIOLATION]
    assert user.hashed_password == stored


async def test_change_rotates_the_asking_session_ends_the_others_and_updates_the_credential(
    session: AsyncSession,
) -> None:
    user = await add_user(session)
    first = await log_in_via_service(session)
    second = await log_in_via_service(session, now=T0)
    third = await log_in_via_service(session, now=T0)
    predecessor = await row_for(session, second.token)
    context = await context_for(session, second.token)

    issued = await change_password(
        session,
        context,
        current_password=STRONG_PASSWORD,
        new_password=NEW_PASSWORD,
        now=T0 + timedelta(hours=1),
    )

    # The asking session was *rotated*: same family, replacement chain, and
    # the absolute deadline inherited (a rotation never extends a sign-in).
    rotated = await row_for(session, second.token)
    successor = await row_for(session, issued.token)
    assert issued.token != second.token
    assert issued.csrf_token != second.csrf_token
    assert rotated.revoked_reason == "rotated"
    assert rotated.replaced_by_id == successor.id
    assert successor.family_id == predecessor.family_id
    assert successor.absolute_expires_at == predecessor.absolute_expires_at == T0 + ABSOLUTE
    assert successor.idle_expires_at == T0 + timedelta(hours=1) + IDLE

    # Every other session is simply over — the credential they authenticated
    # with no longer exists.
    assert (await row_for(session, first.token)).revoked_reason == "password_change"
    assert (await row_for(session, third.token)).revoked_reason == "password_change"

    # The credential itself: new hash under current parameters, forced-change
    # state cleared, and the reset instant recorded.
    assert verify_password(NEW_PASSWORD, user.hashed_password) is True
    assert verify_password(STRONG_PASSWORD, user.hashed_password) is False
    assert password_needs_rehash(user.hashed_password) is False
    assert user.must_change_password is False
    assert user.password_reset_at == T0 + timedelta(hours=1)

    # The successor is the live session; an ended sibling is a plain refusal.
    assert await resolve_session(session, issued.token, now=T0 + timedelta(hours=2)) is not None
    assert await resolve_session(session, first.token, now=T0 + timedelta(hours=2)) is None


async def test_a_forced_first_login_change_clears_the_flag(session: AsyncSession) -> None:
    user = await add_user(session, must_change_password=True)
    issued = await log_in_via_service(session)
    assert user.must_change_password is True
    context = await context_for(session, issued.token)

    await change_password(
        session, context, current_password=STRONG_PASSWORD, new_password=NEW_PASSWORD
    )

    assert user.must_change_password is False


# --- the re-authentication throttle -------------------------------------------


async def test_failed_current_passwords_are_throttled_and_the_count_persists(
    session: AsyncSession,
) -> None:
    user = await add_user(session)
    issued = await log_in_via_service(session)
    context = await context_for(session, issued.token)

    for _ in range(5):
        with pytest.raises(InvalidCurrentPassword):
            await change_password(
                session, context, current_password="guess", new_password=NEW_PASSWORD, now=T0
            )

    # The sixth attempt is denied *before* the password is even verified —
    # the correct password does not get through, and no Argon2 work was spent.
    with pytest.raises(PasswordRateLimited) as limited:
        await change_password(
            session, context, current_password=STRONG_PASSWORD, new_password=NEW_PASSWORD, now=T0
        )
    assert limited.value.retry_after_seconds == 900  # T0 is a window start

    # Every failure committed its own count (F028's lesson, same shape) —
    # and every *attempt* counts, the denied sixth included, exactly as the
    # login bucket behaves.
    bucket = await bucket_row(session, password_key(EMAIL))
    assert bucket is not None and bucket.hit_count == 6
    assert verify_password(STRONG_PASSWORD, user.hashed_password) is True


async def test_a_verified_current_password_forgives_earlier_failures(session: AsyncSession) -> None:
    await add_user(session)
    issued = await log_in_via_service(session)
    context = await context_for(session, issued.token)

    for _ in range(4):
        with pytest.raises(InvalidCurrentPassword):
            await change_password(
                session, context, current_password="guess", new_password=NEW_PASSWORD, now=T0
            )

    # The right password, but a new one the policy refuses: the verification
    # succeeded, so the failure budget resets — *and that reset persists*
    # through the policy refusal (its own commit), or the user's next try
    # would start from five failures.
    with pytest.raises(PasswordPolicyViolation):
        await change_password(
            session, context, current_password=STRONG_PASSWORD, new_password="short", now=T0
        )
    assert await bucket_row(session, password_key(EMAIL)) is None

    with pytest.raises(InvalidCurrentPassword):
        await change_password(
            session, context, current_password="guess", new_password=NEW_PASSWORD, now=T0
        )
    bucket = await bucket_row(session, password_key(EMAIL))
    assert bucket is not None and bucket.hit_count == 1  # a fresh budget, not a lockout


# --- admin reset (service level) ----------------------------------------------


async def test_reset_password_forces_a_change_and_kills_every_session(
    session: AsyncSession,
) -> None:
    user = await add_user(session)
    bystander = await add_user(session, email=OTHER_EMAIL)
    first = await log_in_via_service(session)
    second = await log_in_via_service(session, now=T0)
    untouched = await log_in_via_service(session, email=OTHER_EMAIL, now=T0)

    temporary = await reset_password(session, user, now=T0 + timedelta(hours=1))

    # The temporary credential is real, policy-passing (C15's uniform path)
    # and stored only as a current-parameter hash.
    assert verify_password(temporary, user.hashed_password) is True
    assert verify_password(STRONG_PASSWORD, user.hashed_password) is False
    assert password_policy_violations(temporary, email=user.email) == []
    assert password_needs_rehash(user.hashed_password) is False

    # Forced change begins; the reset is recorded; every session of the
    # target is over — both families, reason `admin` — and nobody else's is.
    assert user.must_change_password is True
    assert user.password_reset_at == T0 + timedelta(hours=1)
    assert (await row_for(session, first.token)).revoked_reason == "admin"
    assert (await row_for(session, second.token)).revoked_reason == "admin"
    survivor = await row_for(session, untouched.token)
    assert survivor.revoked_at is None
    assert bystander.id != user.id

    # The full recovery cycle, end to end: the temporary password signs in
    # and the login response surfaces the forced change (F028's flag).
    reissued = await log_in_via_service(session, now=T0 + timedelta(hours=2), password=temporary)
    assert reissued.user.must_change_password is True


# --- over HTTP -----------------------------------------------------------------


async def test_change_password_over_http_rotates_the_cookies(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await add_user(session)
    old_token, old_csrf = await login(client)
    other_token, _ = await login(client)

    response = await change_over_http(client, token=old_token, csrf=old_csrf)

    assert response.status_code == 204
    assert response.content == b""
    fresh = cookie_value(one_cookie(response, SESSION_COOKIE_NAME))
    fresh_csrf = cookie_value(one_cookie(response, CSRF_COOKIE_NAME))
    assert fresh != old_token and fresh_csrf != old_csrf

    # The sibling session is over; the fresh pair works; the new password
    # signs in and the old one does not.
    assert (await row_for(session, other_token)).revoked_reason == "password_change"
    assert await resolve_session(session, fresh) is not None
    assert user.must_change_password is False
    assert verify_password(NEW_PASSWORD, user.hashed_password) is True

    again, _ = await login(client, password=NEW_PASSWORD)
    assert again != fresh and again != old_token
    refusal = await client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": STRONG_PASSWORD},
        headers={"Origin": GOOD_ORIGIN},
    )
    assert refusal.status_code == 401


async def test_change_password_without_a_session_is_401(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": STRONG_PASSWORD, "new_password": NEW_PASSWORD},
        headers={"Origin": GOOD_ORIGIN},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == NOT_AUTHENTICATED_DETAIL


async def test_change_password_requires_the_csrf_double_submit(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await add_user(session)
    token, csrf = await login(client)
    stored = user.hashed_password

    # Session cookie present, no X-CSRF-Token: the F029 middleware refuses
    # before the handler (a new unsafe endpoint is covered by construction).
    as_cookies(client, session_cookies(token, csrf))
    response = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": STRONG_PASSWORD, "new_password": NEW_PASSWORD},
        headers={"Origin": GOOD_ORIGIN},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == TOKEN_DETAIL
    assert user.hashed_password == stored


async def test_a_wrong_current_password_is_a_field_error_not_a_401(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    token, csrf = await login(client)

    response = await change_over_http(client, token=token, csrf=csrf, current="not the password")

    # Field-addressable: the form maps it onto the current_password input.
    # Deliberately not 401 — that is how this API says "session over", and
    # the session is very much alive.
    assert response.status_code == 422
    (entry,) = response.json()["detail"]
    assert entry["loc"] == ["body", "current_password"]
    assert entry["msg"] == "Current password is incorrect."
    assert "input" not in entry  # a credential must not be echoed back
    assert "not the password" not in response.text
    assert await resolve_session(session, token) is not None


async def test_policy_violations_land_on_the_new_password_field(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    token, csrf = await login(client)

    # Two broken rules at once (too short, and on the common list): the form
    # gets the full picture in one round trip, all located at new_password.
    response = await change_over_http(client, token=token, csrf=csrf, new="password123")

    assert response.status_code == 422
    entries = response.json()["detail"]
    assert len(entries) == 2
    assert all(entry["loc"] == ["body", "new_password"] for entry in entries)
    assert all("input" not in entry for entry in entries)
    assert "password123" not in response.text


async def test_throttled_change_password_answers_429_with_retry_after(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await add_user(session)
    token, csrf = await login(client)

    for _ in range(5):
        response = await change_over_http(client, token=token, csrf=csrf, current="guess")
        assert response.status_code == 422

    response = await change_over_http(client, token=token, csrf=csrf)

    assert response.status_code == 429
    assert response.json()["detail"] == PASSWORD_RATE_LIMITED_DETAIL
    assert response.headers["retry-after"] == "900"  # frozen clock, window start
    # The gate refused before any verification: the credential is untouched.
    assert verify_password(STRONG_PASSWORD, user.hashed_password) is True
