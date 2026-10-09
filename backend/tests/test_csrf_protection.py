"""The CSRF middleware, exercised through the real application (F029).

The middleware wraps every route (``app/main.py``), so these tests drive it
*in situ* — the same placement that makes it impossible for a future
endpoint to be added without it. ``/auth/logout`` is the canvas: it is an
unsafe, cookie-carrying request whose success and failure are both easy to
observe (204 and a revoked row, versus a 403 and an untouched one).

What is pinned here, in the order of what a mistake would cost:

- **The double-submit is enforced** whenever the session cookie is present —
  and a refused request changes nothing (the session survives).
- **The origin check** refuses cross-site origins, ``Origin: null``, a
  scheme-mismatched origin and a lookalike host — even when the double-submit
  itself is perfect, because passing one check must never excuse the other.
- **The referer stands in** for the origin only when the origin is absent.
- **Safe methods are never checked** — they must keep working without any
  precondition.
- **Login's carve-out**: a cross-site origin is refused there too (login
  CSRF is real), but a *dead session cookie* — which JavaScript cannot delete,
  because it is HttpOnly — must not lock the user out of the login form.
"""

import json

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.csrf import ORIGIN_DETAIL, TOKEN_DETAIL, CsrfMiddleware
from app.core.security import hash_password
from app.models import User
from app.services.sessions import log_out, resolve_session

pytestmark = pytest.mark.asyncio

EMAIL = "ada@example.com"
STRONG_PASSWORD = "correct horse battery staple"

# The origins the app was actually built with (the middleware captured the
# trusted set at app-creation time), plus adversaries that must not pass.
GOOD_ORIGIN = next(iter(get_settings().trusted_origins), "http://localhost:5173")
BAD_ORIGIN = "https://evil.example"
# The same host and port as the trusted origin, different scheme — the
# near-miss a substring or prefix comparison would wrongly accept.
MISMATCHED_SCHEME = (
    "https://" if GOOD_ORIGIN.startswith("http://") else "http://"
) + GOOD_ORIGIN.split("://", 1)[1]


async def add_user(session: AsyncSession) -> User:
    user = User(
        email=EMAIL,
        full_name="Ada Lovelace",
        hashed_password=hash_password(STRONG_PASSWORD),
    )
    session.add(user)
    await session.flush()
    return user


def one_cookie(response: httpx.Response, name: str) -> str:
    matches = [h for h in response.headers.get_list("set-cookie") if h.startswith(f"{name}=")]
    assert len(matches) == 1, matches
    return matches[0]


def cookie_value(header: str) -> str:
    return header.split("=", 1)[1].split(";", 1)[0].strip('"')


async def login(client: httpx.AsyncClient) -> tuple[str, str]:
    """Log in over HTTP, returning the (session token, csrf token) pair."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": STRONG_PASSWORD},
        headers={"Origin": GOOD_ORIGIN},
    )
    assert response.status_code == 200, response.text
    return (
        cookie_value(one_cookie(response, SESSION_COOKIE_NAME)),
        cookie_value(one_cookie(response, CSRF_COOKIE_NAME)),
    )


def session_cookies(token: str, csrf: str) -> dict[str, str]:
    return {SESSION_COOKIE_NAME: token, CSRF_COOKIE_NAME: csrf}


def as_cookies(client: httpx.AsyncClient, cookies: dict[str, str]) -> None:
    """Point the client's jar at exactly these cookies for the next request.

    Client-level rather than per-request ``cookies=`` (which httpx deprecates
    as ambiguous). The jar loses nothing here: httpx refuses to *store*
    ``Secure`` cookies from an ``http://`` URL, so responses never add to it,
    and every entry in it is one this file put there.
    """
    client.cookies.clear()
    client.cookies.update(cookies)


async def session_is_live(session: AsyncSession, token: str) -> bool:
    return await resolve_session(session, token) is not None


# --- the double-submit --------------------------------------------------------


async def test_double_submit_is_required_whenever_the_session_cookie_is_present(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    token, csrf = await login(client)
    as_cookies(client, session_cookies(token, csrf))

    refusals = [
        {},  # no origin, no token
        {"Origin": GOOD_ORIGIN},  # origin alone is not a double-submit
        {"Origin": GOOD_ORIGIN, "X-CSRF-Token": "mismatched"},  # a wrong token
        {"Origin": GOOD_ORIGIN, "X-CSRF-Token": ""},  # an empty token is as absent
    ]
    for headers in refusals:
        response = await client.post("/api/v1/auth/logout", headers=headers)
        assert response.status_code == 403, headers
        assert response.json()["detail"] == TOKEN_DETAIL
        assert "set-cookie" not in response.headers

    # Every refusal changed nothing: the session survived all four.
    assert await session_is_live(session, token)

    # The positive control: the token that matches, and no origin at all — a
    # scripted client (browsers always send an origin; a refusal here would
    # only punish tooling, and the double-submit is the binding check).
    response = await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert response.status_code == 204
    assert not await session_is_live(session, token)


# --- the origin check ---------------------------------------------------------


@pytest.mark.parametrize(
    "origin",
    [
        BAD_ORIGIN,
        "null",  # an opaque origin — nothing to compare, so nothing to trust
        MISMATCHED_SCHEME,
        f"{GOOD_ORIGIN}.evil.example",  # a lookalike host
    ],
)
async def test_a_claim_that_is_not_a_trusted_origin_is_refused(
    client: httpx.AsyncClient, session: AsyncSession, origin: str
) -> None:
    await add_user(session)
    token, csrf = await login(client)
    as_cookies(client, session_cookies(token, csrf))

    # A perfect double-submit: passing one check must never excuse another.
    response = await client.post(
        "/api/v1/auth/logout", headers={"Origin": origin, "X-CSRF-Token": csrf}
    )

    assert response.status_code == 403
    assert response.json()["detail"] == ORIGIN_DETAIL
    assert await session_is_live(session, token)


async def test_a_referer_stands_in_only_when_the_origin_is_absent(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    token, csrf = await login(client)
    as_cookies(client, session_cookies(token, csrf))

    # No Origin, a good Referer: accepted (older clients send exactly this).
    response = await client.post(
        "/api/v1/auth/logout",
        headers={"Referer": f"{GOOD_ORIGIN}/settings", "X-CSRF-Token": csrf},
    )
    assert response.status_code == 204

    # And the reverse: a bad Referer is refused like a bad Origin.
    token, csrf = await login(client)
    as_cookies(client, session_cookies(token, csrf))
    response = await client.post(
        "/api/v1/auth/logout",
        headers={"Referer": f"{BAD_ORIGIN}/settings", "X-CSRF-Token": csrf},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == ORIGIN_DETAIL

    # When both are present, Origin wins: a hostile Origin is not redeemed by
    # a trustworthy Referer.
    token, csrf = await login(client)
    as_cookies(client, session_cookies(token, csrf))
    response = await client.post(
        "/api/v1/auth/logout",
        headers={
            "Origin": BAD_ORIGIN,
            "Referer": f"{GOOD_ORIGIN}/settings",
            "X-CSRF-Token": csrf,
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == ORIGIN_DETAIL


# --- everything else ----------------------------------------------------------


async def test_safe_requests_are_never_checked(client: httpx.AsyncClient) -> None:
    as_cookies(client, session_cookies("junk", "junk"))
    response = await client.get("/api/v1/health")
    assert response.status_code == 200


async def test_a_non_ascii_double_submit_value_is_refused_not_a_crash() -> None:
    """Latin-1 header bytes must earn a 403, not a 500.

    ``secrets.compare_digest`` raises ``TypeError`` on non-ASCII *strings*
    (and both sides of the comparison are caller-controlled), so this pins
    the encode-to-bytes guard in ``app/core/csrf.py``. httpx refuses to send
    such a header at all, which is why this one test drives the middleware
    with a hand-built ASGI scope instead of an HTTP request. 0xE9 is ``é``
    in the latin-1 encoding ASGI headers use.
    """

    class UnreachedApp:
        async def __call__(self, scope: object, receive: object, send: object) -> None:
            raise AssertionError("a refused request must never reach the app")

    middleware = CsrfMiddleware(
        UnreachedApp(),  # type: ignore[arg-type]
        trusted_origins=frozenset({GOOD_ORIGIN}),
    )
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/auth/logout",
        "headers": [
            (b"origin", GOOD_ORIGIN.encode()),
            (b"cookie", f"{SESSION_COOKIE_NAME}=abc; {CSRF_COOKIE_NAME}=abc".encode()),
            (b"x-csrf-token", b"\xe9"),
        ],
    }
    sent: list[dict] = []

    async def send(message: dict) -> None:
        sent.append(message)

    async def receive() -> dict:
        return {"type": "http.request"}

    await middleware(scope, receive, send)  # type: ignore[arg-type]

    assert sent[0]["type"] == "http.response.start"
    assert sent[0]["status"] == 403
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    assert json.loads(body)["detail"] == TOKEN_DETAIL


# --- login's carve-out --------------------------------------------------------


async def test_login_refuses_a_cross_site_origin(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": STRONG_PASSWORD},
        headers={"Origin": BAD_ORIGIN},
    )

    # Login CSRF is real (a victim tricked into the attacker's account), and
    # the origin check is the layer that stops it.
    assert response.status_code == 403
    assert response.json()["detail"] == ORIGIN_DETAIL
    assert "set-cookie" not in response.headers


async def test_login_accepts_an_absent_or_trusted_origin(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    body = {"email": EMAIL, "password": STRONG_PASSWORD}

    # A scripted client (curl, the operator's smoke tests) claims no origin.
    assert (await client.post("/api/v1/auth/login", json=body)).status_code == 200
    # A browser claims the frontend's origin.
    response = await client.post("/api/v1/auth/login", json=body, headers={"Origin": GOOD_ORIGIN})
    assert response.status_code == 200


async def test_a_dead_session_cookie_does_not_lock_the_login_form(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The carve-out with its teeth.

    JavaScript cannot delete the HttpOnly session cookie, so after a session
    dies server-side (logout-all elsewhere, an admin's revocation, expiry) the
    browser keeps presenting it — to every request, login included. If login
    demanded the double-submit, the user would be locked out of the one form
    that could fix their state.
    """
    await add_user(session)
    dead_token, dead_csrf = await login(client)
    context = await resolve_session(session, dead_token)
    assert context is not None
    await log_out(session, context)

    as_cookies(client, session_cookies(dead_token, dead_csrf))
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": STRONG_PASSWORD},
        # A browser always claims an origin; it will not send X-CSRF-Token on
        # a login form. Exactly this shape must work.
        headers={"Origin": GOOD_ORIGIN},
    )

    assert response.status_code == 200
    fresh = cookie_value(one_cookie(response, SESSION_COOKIE_NAME))
    # A fresh session was issued — different from the dead one it rode in
    # beside — and it works; the dead token stays dead.
    assert fresh != dead_token
    assert await session_is_live(session, fresh)
    assert not await session_is_live(session, dead_token)
