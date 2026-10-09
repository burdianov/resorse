"""The sessions table: who is signed in, and every way a sign-in ends.

ARCHITECTURE §3 (DECISIONS C12) chose opaque rotating session cookies: the
cookie carries a 256-bit session ID, the database stores only its SHA-256
digest, and everything the requirements ask of sessions — instant revocation,
logout-all, rotation, theft detection — is a row update rather than a token
scheme. This table is where all of it lives.

The columns are the story of a session over time:

- ``token_hash`` — the unique lookup key, produced by
  ``hash_session_token`` from whatever cookie was presented. The raw ID is
  never stored, and the CHECK pins the column's shape to exactly what that
  function returns, so a raw token, a truncated digest or an Argon2 string
  cannot be inserted even by a script.
- ``family_id`` — one login starts a family; every rotation adds a member
  carrying the same family id. Presenting a *superseded* member (rotation
  replay, F029) ends the whole family with one UPDATE.
- ``absolute_expires_at`` / ``idle_expires_at`` — two deadlines, because a
  session can die of either: the absolute one never moves (a sign-in cannot
  outlive it however active the user is), the idle one moves forward on
  activity and can never be pushed past the absolute one (CHECK). One column
  would conflate "signed in last Tuesday" with "live since June".
- ``revoked_at`` / ``revoked_reason`` — all-or-nothing (CHECK): a revocation
  without a reason, or a reason without a revocation, is not a state this
  table can represent. The reason is a closed vocabulary (CHECK) so the
  history stays queryable — F029's replay detection looks for a family member
  revoked as ``rotated``, and ``logout``/``logout_all``/``password_change``/
  ``admin`` each answer "who ended this session, and why" without a join.
- ``replaced_by_id`` — the successor row a rotation issued, so a chain of
  rotations is walkable in both directions. Unique: a session replaces at
  most one predecessor. ``ON DELETE SET NULL``: pruning a successor (a
  cleanup job, someday) must not invalidate the record of what happened.

There is deliberately **no relationship on ``User``**. The auth path resolves
a session by its own indexed columns — the token hash, or ``user_id`` for
logout-all — and never by loading a user's session list, so the FK plus its
index are the whole API. A ``selectin`` relationship here would quietly add a
second query to every authenticated request; a default one would raise under
async loading. Neither is wanted, so neither exists.

The class is ``UserSession`` even though the table is ``sessions``: every
consumer already has a variable named ``session`` (the ``AsyncSession``), and
``select(Session)`` next to a ``session`` parameter is precisely the kind of
near-miss this codebase tries to make impossible.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.core.security import SESSION_TOKEN_HASH_PATTERN

# The closed vocabulary of ``revoked_reason``. Short codes, not prose: they are
# what F029's replay detection and the audit trail match on. A new way to end
# a session is a one-line migration, which is the honest cost of keeping this
# column queryable instead of free text.
REVOCATION_REASONS = (
    "logout",
    "logout_all",
    "rotated",
    "theft_detected",
    "password_change",
    "admin",
)


class UserSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sessions"
    __table_args__ = (
        # The stored value is a SHA-256 digest — never the cookie's raw value.
        CheckConstraint(
            f"token_hash ~ '{SESSION_TOKEN_HASH_PATTERN}'",
            name="token_hash_is_sha256_hex",
        ),
        # An idle deadline beyond the absolute one would be dead configuration:
        # the absolute deadline wins, so the row might as well say so.
        CheckConstraint(
            "idle_expires_at <= absolute_expires_at",
            name="idle_deadline_within_absolute",
        ),
        # Revoked with a reason, or not revoked at all.
        CheckConstraint(
            "(revoked_at IS NULL) = (revoked_reason IS NULL)",
            name="revocation_is_complete",
        ),
        CheckConstraint(
            "revoked_reason IN (" + ", ".join(f"'{reason}'" for reason in REVOCATION_REASONS) + ")",
            name="revoked_reason_is_known",
        ),
        # The request-path lookup: hash the cookie, hit this index, done.
        Index(None, "token_hash", unique=True),
        # A row replaces exactly one predecessor, so it can be *the* successor
        # of only one row. (PostgreSQL unique indexes ignore NULLs, so the
        # unchained majority of rows are unaffected.)
        Index(None, "replaced_by_id", unique=True),
    )

    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    # The rotation family. Generated by the issuer (F028), never by the
    # database: a server-side default here would silently mint a *new* family
    # for every rotation that forgot to copy one.
    family_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Both deadlines are NOT NULL and have no default: a session that forgets
    # to state when it ends is not a row this table accepts.
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    idle_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(String(32))

    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sessions.id", ondelete="SET NULL"),
    )

    def is_active(self, now: datetime) -> bool:
        """Whether this session may still authenticate a request at ``now``.

        ``now`` is a parameter, not a clock read: the caller decides what the
        present is, which is what makes expiry testable and keeps the same rule
        in one place for F028's request dependency and F029's rotation.

        The comparisons are strict — at the instant of a deadline the session
        is already over. A revoked session is inactive from the moment the row
        says so, whatever its deadlines still read.
        """
        return (
            self.revoked_at is None
            and now < self.idle_expires_at
            and now < self.absolute_expires_at
        )
