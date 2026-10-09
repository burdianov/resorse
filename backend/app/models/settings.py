"""The application-settings table: typed overrides of a declared registry.

BP-7.5 asks for "typed allowlist key/value in `app_settings`" and §8.2's data
model fixes the shape: ``key`` unique, ``value`` JSONB *typed via registry*,
plus who touched it and when. The registry lives in code
(``app/core/settings_registry.py``) — this table only ever stores overrides
for keys that exist there, because the API validates against the registry
before anything is written (no arbitrary mass-assignment, §7.5).

Two deliberate properties:

- **A missing row is not an error.** Unwritten keys fall back to the
  registry's default at read time, so a fresh deployment needs no seeding
  step and a key added in a later release simply starts at its default.
- **``updated_by`` is ``SET NULL``, never CASCADE.** Who last changed a
  setting is attribution, not ownership; deleting a user must not delete the
  setting (F024's reasoning for audit-facing references, applied here).
  ``value`` is NOT NULL: "the key exists with a null value" is not a state
  this table needs — removing an override would be a delete, and the API
  deliberately exposes no such verb (a PUT back to the default is the same
  outcome with a clearer history).
"""

import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin

# `app_settings.key` is bounded; the registry's longest key is far below this.
MAX_SETTING_KEY_LENGTH = 100


class AppSetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "app_settings"
    __table_args__ = (
        # The lookup key — read the whole table for the snapshot, upsert by
        # key on write; unique, and the uniqueness is the authority (F024).
        Index(None, "key", unique=True),
        CheckConstraint("length(trim(key)) > 0", name="key_is_present"),
    )

    key: Mapped[str] = mapped_column(String(MAX_SETTING_KEY_LENGTH), nullable=False)
    # Validated against the registry *before* it gets here; the JSONB type is
    # what lets one table hold a string, an enum's string and a boolean
    # without a column per setting.
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)

    # Attribution, not ownership: SET NULL (see the module docstring).
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    # `created_at`/`updated_at` come from TimestampMixin.
