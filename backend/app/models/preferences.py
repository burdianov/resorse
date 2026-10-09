"""Per-user preferences: JSONB values keyed by (user_id, key) (F041).

§8.2's data model, verbatim: ``user_preferences`` with a unique
``(user_id, key)`` pair and a JSONB value, because the values are *display*
choices — a theme name, a column order, a rows-per-page number — whose shapes
differ per key and belong to the frontend that consumes them (F048). The
table therefore stores **free-form keys** rather than a server registry like
settings' (C30): the API caps key shape and value size and reserves nothing,
because a preference is personal data with no authority; the moment a key
carries authority it would be a setting instead.

``ON DELETE CASCADE`` is the opposite choice from ``app_settings.updated_by``
and deliberately so: a deleted user's display preferences are personal data
with no audit value (F024's soft delete keeps the *user* row; a hard cascade
here still can't fire against a soft-deleted account). The isolation rule is
the other half of the design: every query in the service filters by
``user_id`` **in SQL** (BP-8.2), and the id always comes from the session —
never from the request.
"""

import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin

# The key's shape: lowercase, dotted/dashed/underscored, bounded. The API
# validates the same pattern before anything is written (one spelling, two
# layers — the F024 convention).
PREFERENCE_KEY_PATTERN = r"^[a-z][a-z0-9_.-]*$"
MAX_PREFERENCE_KEY_LENGTH = 100


class UserPreference(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_preferences"
    __table_args__ = (
        # One row per (user, key) — the upsert's conflict target and the
        # uniqueness authority (F024's pattern).
        Index(None, "user_id", "key", unique=True),
        CheckConstraint(
            f"key ~ '{PREFERENCE_KEY_PATTERN}'",
            name="key_is_lowercase_dotted",
        ),
        CheckConstraint(
            f"length(key) <= {MAX_PREFERENCE_KEY_LENGTH}",
            name="key_within_length",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        # No separate index: the composite (user_id, key) unique index below
        # serves every user_id-prefix lookup this table has (list, upsert).
    )

    key: Mapped[str] = mapped_column(String(MAX_PREFERENCE_KEY_LENGTH), nullable=False)

    # Any JSON value except null (`PUT {"value": null}` is refused, not
    # stored): "a preference equal to nothing" is a DELETE, and a JSON null
    # and an absent row should not both exist as "no preference".
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
