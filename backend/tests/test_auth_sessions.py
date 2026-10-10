"""Session resolution, rotation, replay detection and logout (F029).

Two layers, both real:

- **Service-level tests** drive ``app/services/sessions.py`` directly with an
  explicit ``now`` — the clock is a parameter there, so expiry, the idle
  slide and rotation deadlines are exact without patching anything.
- **HTTP tests** drive ``/auth/logout`` and ``/auth/logout-all`` through the
  real application (the shared conftest fixtures), passing cookies explicitly
  per request. The httpx cookie jar is deliberately not used: httpx (via
  ``http.cookiejar``'s default policy) refuses to *store* ``Secure`` cookies
  from an ``http://`` URL, so the jar would silently drop exactly the cookies
  under test.

Session rows are created the way production creates them — through F028's
``log_in`` — never hand-built: the file doubles as a regression net across
the two tasks, and a rotation test that only passes on fabricated rows would
be testing the fixture, not the product.

The replay story, end to end: login → rotate → present the superseded ID →
the whole family dies (``theft_detected``) while the already-``rotated`` row
keeps its reason. The assertions re-read through ``populate_existing``
because the family revocation is a bulk UPDATE that bypasses the identity
map (ARCHITECTURE §12, F025's recorded trap — this is the task it warned
about).
"""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import NOT_AUTHENTICATED_DETAIL
from app.core.config import get_settings
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.security import hash_password, hash_session_token
from app.models import User, UserSession
from app.services.auth import IssuedSession, log_in
from app.services.sessions import log_out, resolve_session, rotate_session

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

EMAIL = "ada@example.com"
OTHER_EMAIL = "grace@example.com"
STRONG_PASSWORD = "correct horse battery staple"
CLIENT_IP = "203.0.113.7"

# A fixed "present" for the service-level tests. Everything the services do
# with time takes it as a parameter, so these are exact, not approximate.
T0 = datetime(2026, 10, 10, 12, 0, 0, tzinfo=UTC)
IDLE = timedelta(hours=12)  # Settings.session_idle_timeout_minutes default
ABSOLUTE = timedelta(days=30)  # Settings.session_absolute_lifetime_days default

# The origin a browser would claim: one of the configured trusted ones (the
# middleware was built with this set at app-creation time, so tests must use
# the same values the app actually enforces).
GOOD_ORIGIN = next(iter(get_settings().trusted_origins), "http://localhost:5173")


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
    session: AsyncSession, *, email: str = EMAIL, now: datetime = T0
) -> IssuedSession:
    return await log_in(
        session, email=email, password=STRONG_PASSWORD, client_ip=CLIENT_IP, now=now
    )


async def row_for(session: AsyncSession, token: str) -> UserSession:
    """The row behind ``token``, re-read from the database on purpose."""
    row = await session.scalar(
        select(UserSession)
        .where(UserSession.token_hash == hash_session_token(token))
        .execution_options(populate_existing=True),
    )
    assert row is not None
    return row


async def session_rows(session: AsyncSession) -> list[UserSession]:
    return list(await session.scalars(select(UserSession)))


def one_cookie(response: httpx.Response, name: str) -> str:
    matches = [h for h in response.headers.get_list("set-cookie") if h.startswith(f"{name}=")]
    assert len(matches) == 1, matches
    return matches[0]


def cookie_value(header: str) -> str:
    value = header.split("=", 1)[1].split(";", 1)[0]
    return value.strip('"')


async def login(client: httpx.AsyncClient, *, email: str = EMAIL) -> tuple[str, str]:
    """Log in over HTTP, returning the (session token, csrf token) pair."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": STRONG_PASSWORD},
        headers={"Origin": GOOD_ORIGIN},
    )
    assert response.status_code == 200, response.text
    return (
        cookie_value(one_cookie(response, SESSION_COOKIE_NAME)),
        cookie_value(one_cookie(response, CSRF_COOKIE_NAME)),
    )


def as_cookies(client: httpx.AsyncClient, cookies: dict[str, str]) -> None:
    """Point the client's jar at exactly these cookies for the next request.

    Client-level rather than per-request ``cookies=`` (which httpx deprecates
    as ambiguous). The jar loses nothing here: httpx refuses to *store*
    ``Secure`` cookies from an ``http://`` URL, so responses never add to it,
    and every entry in it is one this file put there.
    """
    client.cookies.clear()
    client.cookies.update(cookies)


def session_cookies(token: str, csrf: str) -> dict[str, str]:
    return {SESSION_COOKIE_NAME: token, CSRF_COOKIE_NAME: csrf}


def csrf_headers(csrf: str) -> dict[str, str]:
    """The headers F029's middleware demands of a cookie-carrying unsafe
    request: the double-submit pair and a browser's origin."""
    return {"Origin": GOOD_ORIGIN, "X-CSRF-Token": csrf}


# --- resolution (service level) ----------------------------------------------


async def test_resolving_a_live_session_returns_its_user(session: AsyncSession) -> None:
    user = await add_user(session)
    issued = await log_in_via_service(session)

    context = await resolve_session(session, issued.token, now=T0)

    assert context is not None
    assert context.user.id == user.id
    assert context.token == issued.token
    assert context.row.token_hash == hash_session_token(issued.token)


async def test_resolving_slides_the_idle_deadline_and_never_the_absolute_one(
    session: AsyncSession,
) -> None:
    await add_user(session)
    issued = await log_in_via_service(session)
    assert (await row_for(session, issued.token)).idle_expires_at == T0 + IDLE

    assert await resolve_session(session, issued.token, now=T0 + timedelta(hours=1)) is not None

    row = await row_for(session, issued.token)
    # Activity moved the idle deadline forward...
    assert row.idle_expires_at == T0 + timedelta(hours=1) + IDLE
    # ...and the absolute one not at all.
    assert row.absolute_expires_at == T0 + ABSOLUTE

    # The cap binds when the time left before the absolute deadline is shorter
    # than one idle timeout. Rather than chaining slides across thirty
    # simulated days, shorten this row's own absolute deadline — a legal state
    # (the CHECK only demands idle ≤ absolute, and editing the configured
    # lifetimes mid-session produces exactly it).
    row.absolute_expires_at = T0 + timedelta(hours=13, minutes=30)
    await session.commit()

    assert await resolve_session(session, issued.token, now=T0 + timedelta(hours=12)) is not None
    row = await row_for(session, issued.token)
    # The slide wanted T0+24h; the absolute deadline said no.
    assert row.idle_expires_at == T0 + timedelta(hours=13, minutes=30)
    assert row.idle_expires_at == row.absolute_expires_at


async def test_expired_sessions_are_refused_but_never_rewritten(session: AsyncSession) -> None:
    await add_user(session)
    issued = await log_in_via_service(session)

    # One second past the idle deadline; then exactly at the absolute one
    # (deadlines are strict — at the instant of expiry the session is over).
    assert (
        await resolve_session(session, issued.token, now=T0 + IDLE + timedelta(seconds=1)) is None
    )
    assert await resolve_session(session, issued.token, now=T0 + ABSOLUTE) is None

    # Expiry is not a security event: nothing was revoked, nothing rewritten.
    row = await row_for(session, issued.token)
    assert row.revoked_at is None
    assert row.revoked_reason is None


async def test_a_logged_out_session_is_refused(session: AsyncSession) -> None:
    await add_user(session)
    issued = await log_in_via_service(session)
    context = await resolve_session(session, issued.token, now=T0)
    assert context is not None

    await log_out(session, context, now=T0 + timedelta(minutes=5))

    assert await resolve_session(session, issued.token, now=T0 + timedelta(minutes=6)) is None
    row = await row_for(session, issued.token)
    assert row.revoked_reason == "logout"


@pytest.mark.parametrize(
    ("label", "disable"),
    [("deactivated", {"is_active": False}), ("deleted", {"is_deleted": True})],
)
async def test_a_disabled_users_live_session_is_refused_and_left_alone(
    session: AsyncSession, label: str, disable: dict[str, bool]
) -> None:
    user = await add_user(session)
    issued = await log_in_via_service(session)
    # The account is disabled *after* the sign-in that its session came from:
    # a login by a disabled account is a different refusal (F028's).
    for field, value in disable.items():
        setattr(user, field, value)
    await session.flush()

    assert await resolve_session(session, issued.token, now=T0) is None

    # Refusing access and recording why are different obligations: the row
    # stays for the admin flow (F033) to revoke with a real reason.
    row = await row_for(session, issued.token)
    assert row.revoked_at is None
    assert user.id == row.user_id


# --- rotation and replay (service level) --------------------------------------


async def test_rotation_issues_a_new_id_in_the_same_family(session: AsyncSession) -> None:
    user = await add_user(session)
    issued = await log_in_via_service(session)
    context = await resolve_session(session, issued.token, now=T0)
    assert context is not None

    rotated = await rotate_session(session, context, now=T0 + timedelta(hours=1))

    assert rotated.token != issued.token
    assert rotated.csrf_token != issued.csrf_token
    assert rotated.user.id == user.id

    predecessor = await row_for(session, issued.token)
    successor = await row_for(session, rotated.token)
    # Same family — the chain a replay will kill — with the replacement link
    # walkable in both directions.
    assert successor.family_id == predecessor.family_id
    assert predecessor.revoked_reason == "rotated"
    assert predecessor.revoked_at == T0 + timedelta(hours=1)
    assert predecessor.replaced_by_id == successor.id
    # The absolute deadline is inherited — rotation must not extend it — while
    # the idle deadline restarts from the rotation instant.
    assert successor.absolute_expires_at == T0 + ABSOLUTE
    assert successor.idle_expires_at == T0 + timedelta(hours=1) + IDLE

    # The successor authenticates; it is the live end of the chain.
    assert await resolve_session(session, rotated.token, now=T0 + timedelta(hours=2)) is not None


async def test_replaying_a_rotated_id_kills_the_family_and_spares_others(
    session: AsyncSession,
) -> None:
    await add_user(session)
    first = await log_in_via_service(session)
    # A second live family of the *same user*: the theft response is
    # family-scoped, and a replay in one sign-in must not end another.
    bystander = await log_in_via_service(session, now=T0)
    context = await resolve_session(session, first.token, now=T0)
    assert context is not None
    rotated = await rotate_session(session, context, now=T0 + timedelta(hours=1))

    # The replay: the superseded ID presented again, after the rotation.
    assert await resolve_session(session, first.token, now=T0 + timedelta(hours=2)) is None

    previous = await row_for(session, first.token)
    successor = await row_for(session, rotated.token)
    untouched = await row_for(session, bystander.token)
    # The record of what happened first survives the record of what happened
    # next: the replaced row keeps "rotated", the family dies as
    # "theft_detected".
    assert previous.revoked_reason == "rotated"
    assert successor.revoked_reason == "theft_detected"
    assert successor.revoked_at == T0 + timedelta(hours=2)
    assert untouched.revoked_at is None

    # And the successor is genuinely dead afterwards, not briefly refused.
    assert await resolve_session(session, rotated.token, now=T0 + timedelta(hours=3)) is None


# --- logout and logout-all over HTTP ------------------------------------------


async def test_logout_ends_the_session_and_clears_both_cookies(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    token, csrf = await login(client)

    as_cookies(client, session_cookies(token, csrf))
    response = await client.post("/api/v1/auth/logout", headers=csrf_headers(csrf))

    assert response.status_code == 204
    assert response.content == b""
    for name in (SESSION_COOKIE_NAME, CSRF_COOKIE_NAME):
        header = one_cookie(response, name)
        assert cookie_value(header) == ""
        assert "Max-Age=0" in header
    row = await row_for(session, token)
    assert row.revoked_reason == "logout"
    assert await resolve_session(session, token) is None


async def test_logout_is_204_even_when_there_is_nothing_to_end(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)

    # (a) No cookies at all.
    response = await client.post("/api/v1/auth/logout", headers={"Origin": GOOD_ORIGIN})
    assert response.status_code == 204
    # Both cookies are cleared anyway: the browser's leftover state is the
    # thing being fixed, whether or not this request was authenticated.
    assert len(response.headers.get_list("set-cookie")) == 2

    # (b) A junk cookie with a well-formed double-submit (junk is still a
    # session cookie, so the middleware's rules apply unchanged).
    as_cookies(client, session_cookies("not-a-real-token", "junk-csrf"))
    response = await client.post("/api/v1/auth/logout", headers=csrf_headers("junk-csrf"))
    assert response.status_code == 204
    assert await session_rows(session) == []

    # (c) A session that this endpoint already ended: same 204, same reason.
    token, csrf = await login(client)
    as_cookies(client, session_cookies(token, csrf))
    response = await client.post("/api/v1/auth/logout", headers=csrf_headers(csrf))
    assert response.status_code == 204
    response = await client.post("/api/v1/auth/logout", headers=csrf_headers(csrf))
    assert response.status_code == 204
    assert (await row_for(session, token)).revoked_reason == "logout"


async def test_logout_all_requires_a_live_session(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/auth/logout-all", headers={"Origin": GOOD_ORIGIN})
    assert response.status_code == 401
    assert response.json()["detail"] == NOT_AUTHENTICATED_DETAIL
    assert "set-cookie" not in response.headers

    # A junk cookie passes the middleware's double-submit (it matches itself)
    # and still earns the same one 401 from the resolution.
    as_cookies(client, session_cookies("not-a-real-token", "c"))
    response = await client.post("/api/v1/auth/logout-all", headers=csrf_headers("c"))
    assert response.status_code == 401
    assert response.json()["detail"] == NOT_AUTHENTICATED_DETAIL


async def test_logout_all_ends_every_session_of_one_user_only(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    await add_user(session, email=OTHER_EMAIL)
    ada_first, _ = await login(client)
    ada_second, ada_csrf = await login(client)
    grace_token, _ = await login(client, email=OTHER_EMAIL)

    as_cookies(client, session_cookies(ada_second, ada_csrf))
    response = await client.post("/api/v1/auth/logout-all", headers=csrf_headers(ada_csrf))

    assert response.status_code == 204
    assert cookie_value(one_cookie(response, SESSION_COOKIE_NAME)) == ""
    # Both of Ada's sessions are dead — including the one that gave the order.
    assert (await row_for(session, ada_first)).revoked_reason == "logout_all"
    assert (await row_for(session, ada_second)).revoked_reason == "logout_all"
    assert await resolve_session(session, ada_first) is None
    assert await resolve_session(session, ada_second) is None
    # Grace's session is untouched.
    survivor = await row_for(session, grace_token)
    assert survivor.revoked_at is None
    assert await resolve_session(session, grace_token) is not None


async def test_replaying_a_rotated_id_through_logout_kills_the_family(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    old_token, old_csrf = await login(client)
    context = await resolve_session(session, old_token)
    assert context is not None
    rotated = await rotate_session(session, context)

    # The stale tab (or the thief) holds the old pair; it is well-formed, so
    # it passes the middleware and reaches the handler — and the resolution
    # behind logout is the full one, replay detection included.
    as_cookies(client, session_cookies(old_token, old_csrf))
    response = await client.post("/api/v1/auth/logout", headers=csrf_headers(old_csrf))

    assert response.status_code == 204
    assert (await row_for(session, rotated.token)).revoked_reason == "theft_detected"
    assert (await row_for(session, old_token)).revoked_reason == "rotated"
