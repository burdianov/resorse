"""Sessions at request time: resolution, the idle slide, rotation, revocation (F029).

F028 issues sessions; this module is everything that happens to one
afterwards. The request dependencies (``app/api/v1/dependencies.py``) are thin
wrappers around :func:`resolve_session`; the security decisions live here.

**Resolution** answers "who, if anyone, is this cookie". It looks the row up
by digest, and then, in order:

- A row revoked as ``rotated`` is a **replay**: that ID was superseded by a
  rotation, so whoever presents it is a thief or the victim's stale tab — and
  the two are indistinguishable, which is the point. Both get the same
  answer: revoke every live member of the family as ``theft_detected`` and
  refuse. The presented row keeps its ``rotated`` record — the history of
  what happened first survives what happened next (F025's model test
  rehearsed exactly this, including the identity-map trap below).
- Any other dead row — expired, logged out, family already killed — is a
  plain refusal. Expiry is not a security event; nothing is written.
- A live row whose user is deactivated or deleted is a refusal too. The row
  is left alone: revoking it with a real reason is the admin flow's job
  (F033), and refusing access is not the same obligation as recording why.
- A live, usable row **slides its idle deadline** to ``now + idle timeout``,
  capped by the absolute deadline that never moves, and commits that slide
  immediately. Resolving a request is activity, and the record of activity
  must survive whatever the handler then does — including refusing. That is
  the same instinct as login's commit-before-raise: the request-scoped rule
  in ``app/core/database.py`` ("a handler that raises commits nothing") is
  about the handler's unit of work, and bookkeeping is not the handler's.

**Rotation** issues a successor in the same family and marks the predecessor
``rotated`` with ``replaced_by_id``, atomically, in one commit. The successor
**inherits the absolute deadline** — an absolute deadline is precisely the
promise that no amount of activity extends it (ARCHITECTURE §3) — while its
idle deadline restarts from the rotation instant. Rotation is fired by
events (password change, role change — F030/F035), never by a refresh
endpoint (DECISIONS C12).

**Revocation** is a row update, which is the session design's whole claim:
logout and logout-all and theft-detection are one UPDATE each, effective on
the next request. The bulk UPDATEs bypass SQLAlchemy's identity map
(ARCHITECTURE §12), so anything reading those rows back in the same session
must say ``populate_existing=True`` — the tests do.

``token_version`` is deliberately untouched here: under the opaque-session
design the row *is* the revocation unit, and F029 resolved (DECISIONS C18)
that the column keeps its §6.1a place in the schema without a second role.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import generate_session_token, hash_session_token
from app.models.identity import User
from app.models.session import UserSession
from app.services.auth import IssuedSession


@dataclass(frozen=True)
class SessionContext:
    """A resolved request: the row, its user, and the raw token that found them.

    The raw token is kept because the operations that follow — rotation,
    logout — are *about this credential* (what replaces it, what it becomes
    when revoked), and re-reading it from the request would scatter cookie
    knowledge back through the layers.
    """

    row: UserSession
    user: User
    token: str


def _now(now: datetime | None) -> datetime:
    return datetime.now(UTC) if now is None else now


async def resolve_session(
    session: AsyncSession,
    token: str,
    *,
    now: datetime | None = None,
) -> SessionContext | None:
    """The context behind ``token``, or ``None`` — refusing is not an error here.

    ``None`` covers every refusal: unknown, superseded (after the family
    revocation), expired, revoked, deactivated user. The HTTP layer turns it
    into one 401 with one message; nothing above this function may learn
    *why* a credential failed.
    """
    moment = _now(now)
    row = await session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_session_token(token)),
    )
    if row is None:
        return None

    if row.revoked_reason == "rotated":
        # The replay response. Deliberately before the is_active check: a
        # superseded ID is evidence of compromise whether or not the family
        # around it has also expired.
        await revoke_family(session, row.family_id, now=moment)
        return None

    if not row.is_active(moment):
        return None

    # The auth path loads the user with roles and permissions (`selectin`,
    # F024's design note): every authenticated request re-evaluates the
    # effective access set from the database, so a role change applies on the
    # next request without stale privilege (ARCHITECTURE §3).
    user = await session.get(User, row.user_id)
    if user is None or not user.is_active or user.is_deleted:
        return None

    settings = get_settings()
    slid_to = min(
        moment + timedelta(minutes=settings.session_idle_timeout_minutes),
        row.absolute_expires_at,
    )
    if slid_to > row.idle_expires_at:
        row.idle_expires_at = slid_to
        await session.commit()
    return SessionContext(row=row, user=user, token=token)


async def rotate_within(
    session: AsyncSession,
    context: SessionContext,
    *,
    now: datetime | None = None,
) -> IssuedSession:
    """Issue a successor for ``context``'s session **without committing**.

    The building block behind :func:`rotate_session` and behind F030's
    password change — the latter folds the rotation into its own single
    commit, together with the credential update and the other sessions'
    revocation, because those three are one unit of work. Splitting the
    commit (rotate first, change the hash next) would leave a window where a
    successor session outlives the password it was minted under.
    """
    moment = _now(now)
    settings = get_settings()
    predecessor = context.row
    successor_token = generate_session_token()
    successor = UserSession(
        token_hash=hash_session_token(successor_token),
        family_id=predecessor.family_id,
        user_id=predecessor.user_id,
        # The absolute deadline is inherited, never re-derived: rotation must
        # not extend it (the idle deadline below does the sliding).
        absolute_expires_at=predecessor.absolute_expires_at,
        idle_expires_at=min(
            moment + timedelta(minutes=settings.session_idle_timeout_minutes),
            predecessor.absolute_expires_at,
        ),
    )
    session.add(successor)
    # The database generates the id (uuidv7); `replaced_by_id` needs it now.
    await session.flush()
    predecessor.revoked_at = moment
    predecessor.revoked_reason = "rotated"
    predecessor.replaced_by_id = successor.id
    return IssuedSession(
        user=context.user,
        token=successor_token,
        csrf_token=generate_session_token(),
    )


async def rotate_session(
    session: AsyncSession,
    context: SessionContext,
    *,
    now: datetime | None = None,
) -> IssuedSession:
    """Replace ``context``'s session with a fresh ID in the same family.

    Returns what F028's login returns — the user and the two fresh tokens —
    because callers of rotation (F030's password change, F035's role change)
    set exactly the same cookies in exactly the same way.
    """
    issued = await rotate_within(session, context, now=now)
    await session.commit()
    return issued


async def revoke_family(
    session: AsyncSession,
    family_id: uuid.UUID,
    *,
    now: datetime | None = None,
) -> int:
    """Revoke every live member of a rotation family — the theft response.

    Returns how many rows it changed. Rows already revoked keep their original
    reason: this is what makes the ``rotated`` record survive the
    ``theft_detected`` one (F025's model test, a live rehearsal of this very
    update, and the reason its assertions re-read with ``populate_existing``).
    """
    changed = (
        await session.scalars(
            update(UserSession)
            .where(UserSession.family_id == family_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=_now(now), revoked_reason="theft_detected")
            .returning(UserSession.id),
        )
    ).all()
    await session.commit()
    return len(changed)


async def log_out(
    session: AsyncSession,
    context: SessionContext,
    *,
    now: datetime | None = None,
) -> None:
    """End one session — the ``logout`` endpoint's service half.

    The row is the loaded one (``context.row``), so the update goes through
    the ORM rather than the identity-map-bypassing bulk path.
    """
    context.row.revoked_at = _now(now)
    context.row.revoked_reason = "logout"
    await session.commit()


async def revoke_user_sessions(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    reason: str,
    exclude_session_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> int:
    """Revoke every live session of one user — **without committing**.

    Returns how many rows it changed. ``reason`` comes from the closed
    vocabulary (``app/models/session.py``): ``logout_all`` for the endpoint,
    ``password_change``/``admin`` for F030's flows. ``exclude_session_id``
    spares one row — the password change spares the caller's own session,
    because that one is *rotated* (its successor is the live end of the
    chain), not ended.

    Bulk, one UPDATE, per the session design's claim; a caller whose own
    ``context.row`` is among the rows this bypasses may not read it back
    expecting fresh attributes without ``populate_existing`` (ARCHITECTURE
    §12).
    """
    statement = (
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=_now(now), revoked_reason=reason)
        .returning(UserSession.id)
    )
    if exclude_session_id is not None:
        statement = statement.where(UserSession.id != exclude_session_id)
    changed = (await session.scalars(statement)).all()
    return len(changed)


async def log_out_all(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    now: datetime | None = None,
) -> int:
    """Revoke every live session of one user (the current one included) —
    the ``logout-all`` endpoint's service half. Returns how many rows it
    changed."""
    changed = await revoke_user_sessions(session, user_id, reason="logout_all", now=now)
    await session.commit()
    return changed
