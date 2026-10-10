"""The audit trail: append-only, self-contained, redacted at the door (F043).

§8.2's model (``audit_logs``) and §7.8's law (append-only; the viewer, F044,
is read-only by construction because **no mutation routes exist** to write
here — the only writer is ``app/services/audit.py::record``, called inside
the mutating transaction it describes).

Design decisions that make the trail trustworthy rather than decorative:

- **One transaction, or no story.** ``record`` *adds* a row to the caller's
  session and never commits; the mutation's own commit carries the event. A
  change without its event cannot commit, and an event without its change
  cannot either — the acceptance's atomicity, structural.
- **Self-contained attribution.** ``user_id`` is the live link (``SET NULL``
  on deletion) *and* ``actor_email`` is a frozen snapshot: the trail still
  answers "who" after the account is gone, without joining a tombstone.
- **Redacted at the door.** ``record`` refuses blocked keys (password- and
  token-shaped, recursively) — a caller that tries to log a credential gets
  an error in the transaction, not a leaked row in the trail. Tests scan the
  stored JSON for the canary values too; both layers exist because this is
  the one table that must never hold a secret.
- **A correlation id, not a guess.** ``correlation_id`` comes from the
  request middleware's contextvar (``app/core/request_context.py``) — the
  same id the response's ``X-Request-Id`` header carries and F060's logging
  will adopt, so an audit row and a log line can be joined by one string.
- **No ``updated_at``.** The row has ``created_at`` only, because the table
  has no update path; the absence of the column is the schema's own statement
  of the rule.

Session lifecycle events are deliberately *not* here: the sessions table is
its own append-by-reason audit record (``REVOCATION_REASONS``,
``replaced_by_id``, two timestamps — F025/F029), and duplicating it would
create two records that can disagree. This table is for the *administrative*
mutations §6.3 asks to audit — role and permission changes, account
management, settings — plus the self-service writes that pair with them.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPrimaryKeyMixin

# The closed vocabulary of ``action``. New events are a one-line change plus
# a migration (the CHECK keeps old rows honest), which is the same trade
# REVOCATION_REASONS made: a queryable history beats free text.
AUDIT_ACTIONS: tuple[str, ...] = (
    "user.create",
    "user.update",
    "user.delete",
    "user.reset_password",
    "profile.update",
    "preference.set",
    "preference.delete",
    "role.create",
    "role.update",
    "role.delete",
    "role.matrix_save",
    "permission.create",
    "permission.update",
    "permission.delete",
    "setting.update",
    # The generic file library (F049). Uploading and deleting are the two
    # mutations; a download is a read and is not audited (the inbox precedent,
    # C34). Documents get their own task and their own actions.
    "file.create",
    "file.delete",
    # The reference tables (D005). Three verbs per table, matching the three
    # mutations the CRUD surface has — and *not* a fourth for deactivation:
    # flipping `is_active` is an update, and the row's before/after diff is
    # what records which way the flag went. A `*.deactivate` verb would put
    # the same fact in two places and make "all changes to X" a two-action
    # query.
    "discipline.create",
    "discipline.update",
    "discipline.delete",
    "department.create",
    "department.update",
    "department.delete",
    "designation.create",
    "designation.update",
    "designation.delete",
)

# The entity a row is about, same idea as the actions.
AUDIT_ENTITY_TYPES: tuple[str, ...] = (
    "user",
    "profile",
    "preference",
    "role",
    "permission",
    "setting",
    "file",
    # The reference tables (D005). Singular, like every other member: the entity
    # type names the *kind* of row the event is about, which is what the
    # viewer filters on.
    "discipline",
    "department",
    "designation",
)


class AuditLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        CheckConstraint(
            "action IN (" + ", ".join(f"'{action}'" for action in AUDIT_ACTIONS) + ")",
            name="action_is_known",
        ),
        CheckConstraint(
            "entity_type IN (" + ", ".join(f"'{entity}'" for entity in AUDIT_ENTITY_TYPES) + ")",
            name="entity_type_is_known",
        ),
        CheckConstraint("length(trim(summary)) > 0", name="summary_is_present"),
        # The viewer (F044) paginates newest-first; the index matches.
        Index(None, "created_at"),
    )

    # No TimestampMixin: there is no update path, so there is no updated_at.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Live link (SET NULL: the trail outlives the account)…
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    # …and the frozen snapshot, so "who" survives the deletion too.
    actor_email: Mapped[str | None] = mapped_column(String(320))

    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column()

    # One displayable line, written by the recorder — never generated by
    # rendering details (which could echo something the summary must not).
    summary: Mapped[str] = mapped_column(String(500), nullable=False)

    # Sanitized before/after, validated by `record` (blocked keys refused).
    # Nullable: an event without a diff (a deletion names its entity and
    # stops) is complete without one.
    details: Mapped[Any | None] = mapped_column(JSONB)

    # The request that carried the mutation (middleware contextvar); NULL for
    # CLI/service contexts that have no request.
    correlation_id: Mapped[str | None] = mapped_column(String(64))
