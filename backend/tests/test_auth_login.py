"""Login and session issuance against real PostgreSQL through the real app (F028).

The acceptance is "real DB integration tests", so nothing here stubs the
request path: every test drives ``POST /api/v1/auth/login`` through the actual
FastAPI application over httpx's ASGI transport, with the request-scoped
database session redirected (dependency override) onto the rollback fixture —
the CLI tests' "lending factory" pattern, one layer up. The client fixtures
live in ``conftest.py`` (F029's tests share them).

What this file pins down, in order of how easy each is to get wrong:

- **The refusal is uniform.** Wrong password, unknown email, unparseable email,
  deactivated account, deleted account, unusable stored hash — one status, one
  body, no ``Set-Cookie`` (BP-6.2g: login failures must not enumerate users).
- **Unknown emails still cost a verification.** The dummy-hash path is asserted
  structurally (a spy on ``verify_password``), and its premise — the decoy is
  hashed under current parameters, so it is not a fast path — is asserted
  directly.
- **Failures persist.** The rate-limit counters are committed *by the failure
  path itself*: a throttled attempt that rolled back its own count would be a
  throttle that never throttles. A successful login clears the per-account
  budget but not the per-address one.
- **What a session is.** One row per login, only the digest stored while the
  raw token travels in the cookie, deadlines computed from the clock, and a
  below-policy stored hash upgraded in place on the way through.

The clock is frozen for every test (an autouse patch of the service's
``datetime``): the rate limiter counts in epoch-aligned fixed windows, and a
test that happened to straddle a window boundary would flake once in a
thousand runs — a flake that is nobody's bug is still a bug in the suite.
The frozen instant sits exactly at the start of a 15-minute window, which also
makes ``Retry-After`` deterministic (the full 900 seconds).
"""

from datetime import UTC, datetime, timedelta, tzinfo

import httpx
import pytest
from conftest import ClientFactory
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import INVALID_CREDENTIALS_DETAIL, RATE_LIMITED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.core.rate_limit import account_key, clear, ip_key
from app.core.security import (
    Argon2Parameters,
    build_password_hasher,
    hash_password,
    hash_session_token,
    password_needs_rehash,
    verify_password,
)
from app.models import User, UserSession
from app.models.rate_limit import RateLimitBucket
from app.schemas.auth import MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH
from app.services import auth as auth_service

pytestmark = pytest.mark.asyncio

STRONG_PASSWORD = "correct horse battery staple"
EMAIL = "ada@example.com"
TEST_CLIENT_IP = "203.0.113.7"

# Frozen at the start of a 15-minute window (12:00 is epoch-aligned): every
# hit lands in the same bucket, deadlines are exact, and Retry-After is the
# full window.
FROZEN_NOW = datetime(2026, 10, 10, 12, 0, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    class FrozenDateTime(datetime):
        # `datetime.now` returns `Self`; this double deliberately returns the
        # frozen instant as a plain `datetime`, which `Self` cannot express.
        @classmethod
        def now(cls, tz: tzinfo | None = None) -> datetime:  # type: ignore[override]
            if tz is None:
                return FROZEN_NOW.replace(tzinfo=None)
            return FROZEN_NOW.astimezone(tz)

    monkeypatch.setattr("app.services.auth.datetime", FrozenDateTime)


# --- helpers -----------------------------------------------------------------


async def add_user(
    session: AsyncSession,
    *,
    email: str = EMAIL,
    password: str = STRONG_PASSWORD,
    **overrides: object,
) -> User:
    user = User(
        email=email,
        full_name="Ada Lovelace",
        hashed_password=hash_password(password),
        **overrides,
    )
    session.add(user)
    await session.flush()
    return user


def login_body(email: str, password: str = STRONG_PASSWORD) -> dict[str, str]:
    return {"email": email, "password": password}


def one_cookie(response: httpx.Response, name: str) -> str:
    """The single ``Set-Cookie`` header for ``name``."""
    matches = [h for h in response.headers.get_list("set-cookie") if h.startswith(f"{name}=")]
    assert len(matches) == 1, matches
    return matches[0]


def cookie_value(header: str) -> str:
    return header.split(";", 1)[0].split("=", 1)[1]


async def bucket_row(session: AsyncSession, key: str) -> RateLimitBucket | None:
    return await session.scalar(
        select(RateLimitBucket).where(RateLimitBucket.bucket_key == key),
    )


async def session_rows(session: AsyncSession) -> list[UserSession]:
    return list(await session.scalars(select(UserSession)))


# --- success: what a login produces ------------------------------------------


@pytest.mark.integration
async def test_login_issues_a_session_row_and_both_cookies(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await add_user(session)

    response = await client.post("/api/v1/auth/login", json=login_body("  Ada@Example.COM  "))

    assert response.status_code == 200
    assert response.json()["user"] == {
        "id": str(user.id),
        "email": EMAIL,  # canonicalised, not the submitted spelling
        "full_name": "Ada Lovelace",
        "must_change_password": False,
    }
    # The body is identity only — no credential material of any kind.
    assert STRONG_PASSWORD not in response.text
    assert "argon2" not in response.text

    # Both cookies, exactly the ARCHITECTURE §3 shape. No Max-Age/Expires:
    # a browser-session cookie; the row's deadlines are authoritative.
    session_header = one_cookie(response, SESSION_COOKIE_NAME)
    assert "HttpOnly" in session_header
    assert "Secure" in session_header
    assert "SameSite=lax" in session_header
    assert "Path=/" in session_header
    for absent in ("Max-Age", "Expires", "Domain"):
        assert absent not in session_header
    csrf_header = one_cookie(response, CSRF_COOKIE_NAME)
    assert "HttpOnly" not in csrf_header  # readable by design: F029's double-submit
    assert "Secure" in csrf_header

    # The row: digest stored, raw token only in the cookie, deadlines from the
    # frozen clock, no revocation, last login touched.
    (row,) = await session_rows(session)
    assert row.token_hash == hash_session_token(cookie_value(session_header))
    assert cookie_value(session_header) != cookie_value(csrf_header)
    assert row.user_id == user.id
    assert row.revoked_at is None and row.revoked_reason is None
    assert row.replaced_by_id is None
    assert row.is_active(FROZEN_NOW)
    assert row.idle_expires_at == FROZEN_NOW + timedelta(hours=12)
    assert row.absolute_expires_at == FROZEN_NOW + timedelta(days=30)
    assert user.last_login_at == FROZEN_NOW


@pytest.mark.integration
async def test_each_login_starts_its_own_family(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    for _ in range(2):
        response = await client.post("/api/v1/auth/login", json=login_body(EMAIL))
        assert response.status_code == 200

    first, second = await session_rows(session)
    # Two live sessions for one account (allowed by ARCHITECTURE §3), each its
    # own rotation family — the unit F029 revokes on replay.
    assert first.token_hash != second.token_hash
    assert first.family_id != second.family_id
    assert first.is_active(FROZEN_NOW) and second.is_active(FROZEN_NOW)


# --- the uniform refusal ------------------------------------------------------


@pytest.mark.integration
async def test_every_credential_failure_is_the_same_401(
    make_client: ClientFactory, session: AsyncSession
) -> None:
    await add_user(session)
    await add_user(session, email="off@example.com", is_active=False)
    await add_user(session, email="gone@example.com", is_deleted=True)
    unreadable = await add_user(session, email="broken@example.com")
    unreadable.hashed_password = "this-is-not-a-hash"
    await session.flush()

    cases = [
        (EMAIL, "wrong password entirely"),
        ("nobody@example.com", STRONG_PASSWORD),
        ("not-an-email", STRONG_PASSWORD),
        ("off@example.com", STRONG_PASSWORD),
        ("gone@example.com", STRONG_PASSWORD),
        ("broken@example.com", STRONG_PASSWORD),
    ]
    answers = []
    for index, (email, password) in enumerate(cases):
        # A fresh address per case: the IP budget must not interfere with the
        # property under test.
        case_client = await make_client(f"198.51.100.{index + 1}")
        response = await case_client.post("/api/v1/auth/login", json=login_body(email, password))
        assert response.status_code == 401, (email, response.text)
        assert response.json()["detail"] == INVALID_CREDENTIALS_DETAIL
        assert "set-cookie" not in response.headers
        assert STRONG_PASSWORD not in response.text
        assert "argon2" not in response.text
        answers.append(response.json())

    # Uniformity is not "same status" but "same body": six different causes,
    # one indistinguishable answer (BP-6.2g — no user enumeration).
    assert all(answer == answers[0] for answer in answers)
    assert await session_rows(session) == []


@pytest.mark.integration
async def test_unknown_email_still_pays_a_password_verification(
    make_client: ClientFactory,
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str]] = []

    def spy(password: str, hashed: str, *, hasher: object = None) -> bool:
        calls.append((password, hashed))
        return False

    monkeypatch.setattr(auth_service, "verify_password", spy)

    unknown_client = await make_client("192.0.2.10")
    response = await unknown_client.post(
        "/api/v1/auth/login", json=login_body("nobody@example.com")
    )
    assert response.status_code == 401
    # The unknown-account path ran a verification against the decoy — one
    # Argon2 of the same cost as a real check, so the clock cannot tell the
    # two paths apart.
    assert calls == [(STRONG_PASSWORD, auth_service._DUMMY_PASSWORD_HASH)]

    user = await add_user(session, email="known@example.com")
    calls.clear()
    known_client = await make_client("192.0.2.11")
    response = await known_client.post("/api/v1/auth/login", json=login_body("known@example.com"))
    assert response.status_code == 401
    assert calls == [(STRONG_PASSWORD, user.hashed_password)]


async def test_the_decoy_hash_is_current_parameter() -> None:
    # If this fails, the decoy was hashed under old parameters and is *faster*
    # than a real verification — the timing channel it exists to close would
    # be open again.
    assert password_needs_rehash(auth_service._DUMMY_PASSWORD_HASH) is False
    assert verify_password(STRONG_PASSWORD, auth_service._DUMMY_PASSWORD_HASH) is False


# --- throttling ---------------------------------------------------------------


@pytest.mark.integration
async def test_throttle_per_account_denies_even_the_correct_password(
    make_client: ClientFactory,
) -> None:
    client = await make_client()
    for _ in range(5):
        response = await client.post("/api/v1/auth/login", json=login_body(EMAIL, "guess"))
        assert response.status_code == 401

    denied = await client.post("/api/v1/auth/login", json=login_body(EMAIL))
    assert denied.status_code == 429
    assert denied.json()["detail"] == RATE_LIMITED_DETAIL
    assert denied.headers["retry-after"] == "900"  # the frozen clock is at window start
    assert "set-cookie" not in denied.headers

    # The same 429 for an email that does not exist: the throttle engages
    # whether or not there is an account (a 429 only real accounts could get
    # would itself be an enumeration oracle). A different address, so the
    # unknown email's *account* bucket is the only one that can deny.
    unknown_client = await make_client("192.0.2.20")
    for _ in range(5):
        response = await unknown_client.post(
            "/api/v1/auth/login", json=login_body("nobody@example.com", "guess")
        )
        assert response.status_code == 401
    unknown_denied = await unknown_client.post(
        "/api/v1/auth/login", json=login_body("nobody@example.com", "guess")
    )
    assert unknown_denied.status_code == 429
    assert unknown_denied.json() == denied.json()


@pytest.mark.integration
async def test_throttle_per_address_denies_across_accounts(
    make_client: ClientFactory, session: AsyncSession
) -> None:
    client = await make_client("192.0.2.30")
    for index in range(5):
        response = await client.post(
            "/api/v1/auth/login", json=login_body(f"person{index}@example.com", "guess")
        )
        assert response.status_code == 401  # five *different* account buckets, each at 1

    denied = await client.post(
        "/api/v1/auth/login", json=login_body("another@example.com", "guess")
    )
    assert denied.status_code == 429  # the address bucket — not any account's — said no
    assert denied.json()["detail"] == RATE_LIMITED_DETAIL
    assert denied.headers["retry-after"] == "900"

    # Every attempt was counted against its account bucket too, including the
    # accounts that do not exist — a throttle that skipped them would leak.
    for index in range(5):
        row = await bucket_row(session, account_key(f"person{index}@example.com"))
        assert row is not None and row.hit_count == 1


@pytest.mark.integration
async def test_a_successful_login_clears_the_account_bucket_but_not_the_address(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_user(session)
    # Four failures, so the success is the fifth and last allowed hit — with
    # five failures the success itself would be denied (the throttle gates the
    # correct password too, which is the previous test's subject).
    for _ in range(4):
        response = await client.post("/api/v1/auth/login", json=login_body(EMAIL, "guess"))
        assert response.status_code == 401

    response = await client.post("/api/v1/auth/login", json=login_body(EMAIL))
    assert response.status_code == 200

    # The account's failures are forgotten; the address's are not (one valid
    # credential must not buy a fresh guessing budget for other accounts).
    assert await bucket_row(session, account_key(EMAIL)) is None
    address_row = await bucket_row(session, ip_key(TEST_CLIENT_IP))
    assert address_row is not None and address_row.hit_count == 5

    # Clear the address budget directly to isolate the claim above: the next
    # wrong attempt is a 401, which it could only be if the account counter
    # restarted at zero after the success (without the clear it would already
    # be at 7 and answer 429).
    assert await clear(session, ip_key(TEST_CLIENT_IP)) is True
    await session.commit()
    response = await client.post("/api/v1/auth/login", json=login_body(EMAIL, "guess"))
    assert response.status_code == 401


# --- what happens to the stored hash -----------------------------------------


@pytest.mark.integration
async def test_login_rehashes_a_below_policy_stored_hash(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    weak = build_password_hasher(
        Argon2Parameters(time_cost=1, memory_cost_kib=8192, parallelism=1),
    )
    user = await add_user(session)
    old_hash = hash_password(STRONG_PASSWORD, hasher=weak)
    user.hashed_password = old_hash
    await session.flush()

    response = await client.post("/api/v1/auth/login", json=login_body(EMAIL))

    assert response.status_code == 200
    # The plaintext was in hand at the one moment it could be: a successful
    # login upgrades the row, so raising the parameters never needs a reset.
    assert user.hashed_password != old_hash
    assert verify_password(STRONG_PASSWORD, user.hashed_password) is True
    assert password_needs_rehash(user.hashed_password) is False


@pytest.mark.integration
async def test_must_change_password_is_surfaced_and_still_issues_a_session(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    user = await add_user(session, must_change_password=True)

    response = await client.post("/api/v1/auth/login", json=login_body(EMAIL))

    # Sign-in succeeds — the change-password screen needs a session to do its
    # work — and the flag tells the frontend where to route (F030/F032).
    assert response.status_code == 200
    assert user.must_change_password is True
    assert response.json()["user"]["must_change_password"] is True
    assert len(await session_rows(session)) == 1


# --- request-shape validation -------------------------------------------------


@pytest.mark.integration
async def test_malformed_request_bodies_are_422(client: httpx.AsyncClient) -> None:
    cases: list[dict[str, str]] = [
        {},
        {"email": EMAIL},
        {"email": "", "password": "x"},
        {"email": EMAIL, "password": ""},
        {"email": EMAIL, "password": "x" * (MAX_PASSWORD_LENGTH + 1)},
        {"email": "a" * (MAX_EMAIL_LENGTH + 1), "password": "x"},
    ]
    for body in cases:
        response = await client.post("/api/v1/auth/login", json=body)
        # Shape errors are 422 and reveal nothing about any account — no
        # lookup happens; the credential check never runs.
        assert response.status_code == 422, body
        assert "detail" in response.json()  # the consistent error shape
