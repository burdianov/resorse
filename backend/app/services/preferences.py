"""Per-user preferences: the isolation rule in one place (F041).

Every function takes the **user id from the caller's session** — never from a
request body — and every query filters by it **in SQL** (BP-8.2's acceptance:
"cross-user access denied", proven at the query, not by filtering results in
Python). The service has no notion of "another user's preferences" to begin
with, which is the strongest form of the rule: there is no parameter a bug
could pass the wrong value to.

Key validation lives here so the API and any future caller share one spelling
(the model's ``PREFERENCE_KEY_PATTERN``, imported — F024's two-layer
convention). The value's shape/size/null rules are the schema's
(``app/schemas/preferences.py``), because they are about the *request*; the
key pattern is also a database CHECK, because it is about the *row*.
"""

import re
import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.preferences import (
    MAX_PREFERENCE_KEY_LENGTH,
    PREFERENCE_KEY_PATTERN,
    UserPreference,
)

_KEY_RE = re.compile(PREFERENCE_KEY_PATTERN)


class PreferenceKeyInvalid(Exception):
    """The key is not lowercase dotted/dashed/underscored, or too long."""


def validate_key(key: str) -> str:
    cleaned = key.strip()
    if len(cleaned) > MAX_PREFERENCE_KEY_LENGTH or not _KEY_RE.fullmatch(cleaned):
        raise PreferenceKeyInvalid(
            "Preference keys are lowercase, may contain dots, dashes and "
            "underscores, and are at most 100 characters.",
        )
    return cleaned


async def list_preferences(session: AsyncSession, user_id: uuid.UUID) -> list[UserPreference]:
    """The caller's preferences only — the WHERE is the isolation."""
    return list(
        await session.scalars(
            select(UserPreference)
            .where(UserPreference.user_id == user_id)
            .order_by(UserPreference.key.asc())
        )
    )


async def put_preference(
    session: AsyncSession, *, user_id: uuid.UUID, key: str, value: Any
) -> UserPreference:
    """Upsert one preference for one user; one commit."""
    cleaned = validate_key(key)
    statement = pg_insert(UserPreference).values(user_id=user_id, key=cleaned, value=value)
    await session.execute(
        statement.on_conflict_do_update(
            index_elements=[UserPreference.user_id, UserPreference.key],
            set_={
                "value": statement.excluded.value,
                # TimestampMixin's onupdate does not fire for Core statements
                # (the F026/F039 precedent), so the touch is explicit.
                "updated_at": statement.excluded.updated_at,
            },
        )
    )
    await session.commit()
    row = await session.scalar(
        select(UserPreference).where(
            UserPreference.user_id == user_id, UserPreference.key == cleaned
        )
    )
    assert row is not None  # just upserted, in this transaction
    return row


async def delete_preference(session: AsyncSession, *, user_id: uuid.UUID, key: str) -> None:
    """Delete one preference; **idempotent** — a well-formed key that has no
    row is "no preference", the goal state already achieved."""
    cleaned = validate_key(key)
    await session.execute(
        delete(UserPreference).where(
            UserPreference.user_id == user_id, UserPreference.key == cleaned
        )
    )
    await session.commit()


async def count_for_user(session: AsyncSession, user_id: uuid.UUID) -> int:
    """Used by tests to prove isolation at the row level."""
    count = await session.scalar(
        select(func.count()).select_from(UserPreference).where(UserPreference.user_id == user_id)
    )
    return int(count or 0)
