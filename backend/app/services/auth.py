"""Login — the one place a password becomes a session (F028).

The design problem is not "check the password" (F026's ``verify_password``
does that); it is answering **identically** for every way a login can fail, so
the endpoint tells an attacker nothing about which accounts exist:

- **One refusal for everything.** Unknown email, wrong password, deactivated
  account, deleted account, unusable stored hash — the caller sees one
  ``InvalidCredentials``. The endpoint renders one message (BP-6.2g).
- **Comparable timing.** An unknown email still pays for one Argon2
  verification — against ``_DUMMY_PASSWORD_HASH``, generated at import with
  the current parameters — because "returns in 2 ms" versus "returns in 60 ms"
  is another way to ask "does this account exist?".
- **One throttle body.** Both buckets (per account, per address) are counted
  *before* the lookup and *regardless of the account's existence*, and a denied
  attempt raises one ``LoginRateLimited`` — a 429 that depends only on the
  caller's own behaviour.

The failure paths still **commit**. The rate-limit counters are rows; if the
service raised before committing, every failed login would roll its own count
back and the throttle would count nothing — a login service that is honest
about failure is one that persists failure too. The one deliberate exception
to "services commit" is that success and failure both end with exactly one
commit; the request-scoped rule is in ``app/core/database.py``.

What is issued (ARCHITECTURE §3, DECISIONS C12): a 256-bit token from F025's
``generate_session_token``, stored only as its SHA-256 digest, one new rotation
family per login (``family_id`` — generated here, never by the database, so a
rotation that forgets to copy one cannot silently mint a new family, F029), the
configured idle and absolute deadlines, and a CSRF companion token. The two
cookies themselves are set by the HTTP layer; this module never touches
``Response`` objects.

``token_version`` is deliberately untouched — under the opaque-session design
the session row *is* the revocation unit, and F029 decides whether the column
earns a second role.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.core.config import get_settings
from app.core.rate_limit import RateLimitRule, account_key, clear, hit, ip_key
from app.core.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    password_needs_rehash,
    verify_password,
)
from app.models.identity import User
from app.models.session import UserSession

# The two cookies (ARCHITECTURE §3). Both carry the `__Host-` prefix, which
# browsers only honour when the cookie is Secure, Path=/ and Domain-less — the
# prefix is what makes "a subdomain cannot set or shadow this cookie" true.
# The session cookie is HttpOnly (nothing in JavaScript may read it); the CSRF
# cookie is deliberately readable — F029's double-submit check compares it
# against the X-CSRF-Token header, which only works if the client can read it.
SESSION_COOKIE_NAME = "__Host-session"
CSRF_COOKIE_NAME = "__Host-csrf"


class InvalidCredentials(Exception):
    """The email/password pair did not authenticate. Never says which part."""


class LoginRateLimited(Exception):
    """One of the login buckets is exhausted; ``retry_after_seconds`` is how
    long until the current window ends. The exception is deliberately blind to
    *which* bucket (and to whether the account exists) — the endpoint's answer
    must be too."""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many login attempts.")
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class IssuedSession:
    """What a successful login hands to the HTTP layer: the user, the raw
    session token (goes into the HttpOnly cookie, nowhere else) and the CSRF
    companion token (readable cookie). Expiry lives in the row, not here."""

    user: User
    token: str
    csrf_token: str


# The timing decoy. A fresh hash over an unguessable input at import time:
# generated rather than pasted so it always matches the parameters in
# app/core/security.py — a decoy hashed under old parameters would be faster
# than the real check and re-open the timing channel it exists to close. The
# value can never match any candidate, so the only thing it produces is work.
_DUMMY_PASSWORD_HASH = hash_password(generate_session_token())


def _verify(user: User | None, password: str) -> bool:
    """Whether the password matches the account — spending the same Argon2
    work on the "account does not exist" path as on the real one."""
    if user is None:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        return False
    return verify_password(password, user.hashed_password)


async def log_in(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    client_ip: str,
    now: datetime | None = None,
) -> IssuedSession:
    """Authenticate and start a session family, or raise.

    Raises :class:`LoginRateLimited` when either bucket denies the attempt
    (before any password is checked — a throttled caller must not be able to
    burn verification work), :class:`InvalidCredentials` for every other
    failure. ``now`` is a parameter so tests can pin the clock; the deadlines
    written to the session row derive from it.
    """
    settings = get_settings()
    moment = datetime.now(UTC) if now is None else now
    rule = RateLimitRule(
        limit=settings.login_max_attempts,
        window=timedelta(minutes=settings.login_attempt_window_minutes),
    )

    # The address the account is looked up by — the same canonical form F024's
    # CHECK enforces on the stored column.
    canonical = email.strip().lower()

    # Count the attempt against both buckets before deciding anything. The
    # account bucket exists whether or not the account does: a throttle that
    # only engages for real accounts is an enumeration oracle.
    account = await hit(session, account_key(canonical), rule, now=moment)
    address = await hit(session, ip_key(client_ip), rule, now=moment)
    if not (account.allowed and address.allowed):
        await session.commit()
        raise LoginRateLimited(
            max(account.retry_after_seconds, address.retry_after_seconds),
        )

    # `raiseload` the roles: the login path needs the credential row, not the
    # authorization graph (which is eager by default). If a later edit to this
    # path starts traversing `user.roles`, that is a new query — and a bug —
    # so it fails loudly instead of quietly costing one.
    user = await session.scalar(
        select(User).where(User.email == canonical).options(raiseload(User.roles)),
    )
    authenticated = _verify(user, password)
    if not authenticated or user is None or not user.is_active or user.is_deleted:
        # A correct password on a deactivated account is still a refusal, and
        # it is refused with the same words as a wrong password: "this account
        # is disabled" is exactly the fact an enumerator wants.
        await session.commit()
        raise InvalidCredentials

    # The successful login forgets this account's failures. The address bucket
    # is deliberately *not* cleared: a caller who knows one valid credential
    # could otherwise use it to reset the address budget between rounds of
    # guessing at other accounts. (Both windows are short; the asymmetry only
    # delays an attacker.)
    await clear(session, account_key(canonical))

    # F026's parameters are reviewed constants that may be raised later; a
    # successful login is where a below-policy row is upgraded, with the
    # plaintext in hand and no reset wave.
    if password_needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(password)

    user.last_login_at = moment

    absolute_expires_at = moment + timedelta(days=settings.session_absolute_lifetime_days)
    idle_expires_at = min(
        moment + timedelta(minutes=settings.session_idle_timeout_minutes),
        absolute_expires_at,
    )
    token = generate_session_token()
    session.add(
        UserSession(
            token_hash=hash_session_token(token),
            family_id=uuid.uuid7(),
            user_id=user.id,
            absolute_expires_at=absolute_expires_at,
            idle_expires_at=idle_expires_at,
        ),
    )
    await session.commit()
    return IssuedSession(user=user, token=token, csrf_token=generate_session_token())
