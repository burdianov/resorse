"""Application settings: the snapshot and the guarded write (F039).

One read, one write, both shaped by the registry
(``app/core/settings_registry.py``):

- **The snapshot is defaults overlaid with stored overrides.** Unwritten keys
  read as their defaults — a fresh deployment needs no seeding — and stored
  values were validated on the way in, so reading is a plain fold.
- **The write is all-or-nothing across the keys it touches.** Every candidate
  is validated against its spec *before* the first row changes (F035's
  matrix-save discipline, in miniature): a payload with one bad value writes
  nothing. Upserts run in one commit, `updated_by` records the actor, and the
  response is the fresh snapshot so a client never needs a follow-up GET.
- **Unknown keys are refused, never stored.** The registry is the allowlist
  (BP-7.5); a request naming a key that is not declared gets a
  field-addressable 422 at that key and the rest of the payload is moot.

Audit events remain F043's (the recorded gap), though `updated_by` +
`updated_at` already carry the who/when for the last write per key.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings_registry import SETTINGS_BY_KEY, defaults
from app.models.identity import User
from app.models.settings import AppSetting
from app.services import audit


class UnknownSetting(Exception):
    """A payload named a key the registry does not declare."""

    def __init__(self, key: str) -> None:
        super().__init__(f"Unknown setting: `{key}`.")
        self.key = key


class InvalidSettingValue(Exception):
    """A value failed its spec's validation."""

    def __init__(self, key: str, message: str) -> None:
        super().__init__(message)
        self.key = key
        self.message = message


async def get_settings_snapshot(session: AsyncSession) -> dict[str, Any]:
    """Every declared key's effective value: the default, or the override."""
    snapshot = defaults()
    rows = await session.scalars(select(AppSetting))
    for row in rows:
        # An unknown stored key cannot be written through the API; if one is
        # imported by hand, surfacing it would be worse than ignoring it —
        # the registry defines the contract (and F043's audit would see the
        # import if it ever happens through SQL).
        if row.key in SETTINGS_BY_KEY:
            snapshot[row.key] = row.value
    return snapshot


async def update_settings(
    session: AsyncSession,
    *,
    actor: User,
    values: dict[str, Any],
) -> dict[str, Any]:
    """Validate everything, then upsert everything, in one commit."""
    validated: dict[str, Any] = {}
    for key, value in values.items():
        spec = SETTINGS_BY_KEY.get(key)
        if spec is None:
            raise UnknownSetting(key)
        try:
            validated[key] = spec.validate(value)
        except (TypeError, ValueError) as error:
            # TypeError = wrong JSON type, ValueError = bad value of the
            # right type; both are the same field-addressable 422.
            raise InvalidSettingValue(key, str(error)) from error

    if validated:
        before = await get_settings_snapshot(session)
        changes = {
            key: {"before": before[key], "after": value}
            for key, value in validated.items()
            if before[key] != value
        }
        if changes:
            await audit.record(
                session,
                actor=actor,
                action="setting.update",
                entity_type="setting",
                entity_id=None,
                summary=f"Updated application settings ({len(changes)} key(s) changed).",
                details={"changes": changes},
            )
        statement = pg_insert(AppSetting).values(
            [
                {"key": key, "value": value, "updated_by": actor.id}
                for key, value in validated.items()
            ]
        )
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[AppSetting.key],
                set_={
                    "value": statement.excluded.value,
                    "updated_by": statement.excluded.updated_by,
                    # TimestampMixin's onupdate does not fire for Core
                    # statements (the F026 rate-limit precedent), so the
                    # touch is explicit.
                    "updated_at": statement.excluded.updated_at,
                },
            )
        )
        await session.commit()
    return await get_settings_snapshot(session)
