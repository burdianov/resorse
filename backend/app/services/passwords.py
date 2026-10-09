"""The password lifecycle: self-change and admin reset (F030).

Two ways a stored credential changes, with deliberately different proofs and
consequences (BIG-PROMPT §6.1: "Password changes require current password
except privileged reset"):

- **Self-change** (:func:`change_password`) demands the current password —
  even during a forced first-login change, because the temporary credential
  is still the account's secret. Success is **one unit of work**: the new
  hash, the revocation of every *other* session (``password_change``), the
  rotation of the session that asked, and the clearing of
  ``must_change_password`` all commit together. Splitting that commit would
  leave a live successor session that outlived the password it was minted
  under.
- **Admin reset** (:func:`reset_password`) generates the temporary credential
  itself (F026's ``generate_password``; the caller shows it exactly once),
  forces a change at next sign-in, and revokes **every** session of the
  target (``admin``) — there is no session to spare, because none of them
  belongs to someone who proved the new secret. It does not ask for a
  current password: that is what "privileged" means, and it is also why its
  HTTP endpoint belongs behind F031's ``users.reset_password`` permission —
  F033 builds that endpoint on this service.

**The re-authentication throttle.** Verifying the current password is a
guessing surface of its own: an attacker holding a stolen session cookie
could otherwise try passwords through this flow at Argon2 speed, and the
login throttle would never see it. So the attempts are counted in their own
bucket (``password:account:<email>`` — deliberately not login's, so neither
flow can lock the other out), the gate runs before the Argon2 work, failures
commit before raising (F028's lesson — a rolled-back count throttles
nothing), and a *verified* current password forgives earlier failures,
exactly as a successful login forgives the login bucket.

What each flow records where:

- the stored hash is always rebuilt under the current F026 parameters — a
  password change *is* the rehash;
- ``must_change_password`` is cleared by the self-change and set by the
  reset; ``password_reset_at`` records the instant of the last change or
  reset in both flows ("when was this credential last reissued");
- sessions are revoked as rows (reasons ``password_change`` / ``admin``);
  ``token_version`` has no second role here either (C18).

Concurrency: two sessions changing the password at once is last-writer-wins
— both verified the old password against their own snapshot, and the later
commit's credential and rotation stand. Acceptable for a single-company
tool: the worst outcome is a user signing in again with the password they
just chose, and a row lock would serialise a flow that no one races on
purpose.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.rate_limit import RateLimitRule, clear, hit, password_key
from app.core.security import (
    generate_password,
    hash_password,
    password_policy_violations,
    verify_password,
)
from app.models.identity import User
from app.services.auth import IssuedSession
from app.services.sessions import SessionContext, revoke_user_sessions, rotate_within

# The extra policy violation for "the new password is the current one". Not
# part of password_policy_violations: that function knows nothing about a
# *current* password. The comparison is on plaintexts, which is exactly the
# case a user creates by typing the same value twice — the intent "do not
# re-adopt the credential you are replacing".
SAME_AS_CURRENT_VIOLATION = "New password must be different from the current password."


class InvalidCurrentPassword(Exception):
    """The supplied current password did not authenticate.

    Rendered as a field-addressable 422 (located at ``current_password``),
    never a bare 401: a 401 is how this API says "your session is over" —
    and the frontend's 401 policy reacts to it accordingly. A wrong guess on
    a form must not sign the user out.
    """


class PasswordPolicyViolation(Exception):
    """The new password breaks policy. Carries every broken rule at once so a
    form can show the full picture in one round trip. The messages never
    contain the password (F026's rule)."""

    def __init__(self, violations: list[str]) -> None:
        super().__init__("; ".join(violations))
        self.violations = violations


class PasswordRateLimited(Exception):
    """Too many failed re-authentication attempts; ``retry_after_seconds`` is
    how long until the window ends (the ``Retry-After`` header)."""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many password attempts.")
        self.retry_after_seconds = retry_after_seconds


def _now(now: datetime | None) -> datetime:
    return datetime.now(UTC) if now is None else now


async def change_password(
    session: AsyncSession,
    context: SessionContext,
    *,
    current_password: str,
    new_password: str,
    now: datetime | None = None,
) -> IssuedSession:
    """Replace the signed-in user's credential and end everything it outgrew.

    Order matters and is the security story: the throttle gates before the
    verification (a limited caller cannot burn Argon2 work), the verification
    gates before the new password is even looked at (policy messages for a
    caller who cannot prove the current secret are noise at best), and every
    failing path commits its counter before raising.
    """
    moment = _now(now)
    user = context.user
    settings = get_settings()
    rule = RateLimitRule(
        limit=settings.login_max_attempts,
        window=timedelta(minutes=settings.login_attempt_window_minutes),
    )

    status = await hit(session, password_key(user.email), rule, now=moment)
    if not status.allowed:
        await session.commit()
        raise PasswordRateLimited(status.retry_after_seconds)

    if not verify_password(current_password, user.hashed_password):
        await session.commit()
        raise InvalidCurrentPassword

    # The secret was proven; the failures are forgiven (login's rule, same
    # reason: the budget bounds guessing, not a person who knows the word).
    await clear(session, password_key(user.email))

    violations = password_policy_violations(new_password, email=user.email)
    if new_password == current_password:
        violations.append(SAME_AS_CURRENT_VIOLATION)
    if violations:
        # Committed, so the cleared bucket persists through this refusal —
        # the revision the user is about to submit must not start at the
        # failed-attempt count they just cleared.
        await session.commit()
        raise PasswordPolicyViolation(violations)

    # One unit of work, one commit. Order within it: the other sessions end
    # first (the caller's row is excluded — it is rotated, not ended), then
    # the rotation mints the successor, then the credential and the flags
    # change. The bulk revocation runs before the successor exists, so the
    # successor is not caught by it.
    await revoke_user_sessions(
        session,
        user.id,
        reason="password_change",
        exclude_session_id=context.row.id,
        now=moment,
    )
    issued = await rotate_within(session, context, now=moment)
    user.hashed_password = hash_password(new_password)
    user.must_change_password = False
    user.password_reset_at = moment
    await session.commit()
    return issued


async def reset_password(
    session: AsyncSession,
    user: User,
    *,
    now: datetime | None = None,
) -> str:
    """Admin-initiated reset: a fresh temporary credential, forced change,
    every session revoked. Returns the temporary password — shown exactly
    once by the caller (the endpoint F033 builds), never stored in the clear.

    No current password is asked for: the authority here is the caller's
    permission, not knowledge of the old secret (BIG-PROMPT §6.1). ``user``
    is the target — the policy of *who may reset whom* is F033's endpoint
    concern, not this function's.
    """
    moment = _now(now)
    temporary = generate_password()
    # C15's uniform path: every password passes the policy before hashing. A
    # generated value passes by construction; checking anyway makes a bug in
    # the generator a loud refusal instead of a weak credential.
    violations = password_policy_violations(temporary, email=user.email)
    if violations:
        raise PasswordPolicyViolation(violations)

    user.hashed_password = hash_password(temporary)
    user.must_change_password = True
    user.password_reset_at = moment
    # Every session of the target dies, none spared: the new secret exists
    # only in the caller's console, so no session may outlive the reset.
    # Reason `admin`: ended by an administrative action.
    await revoke_user_sessions(session, user.id, reason="admin", now=moment)
    await session.commit()
    return temporary
