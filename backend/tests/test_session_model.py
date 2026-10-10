"""The sessions table's constraints and its revocation model, against real
PostgreSQL (F025).

The acceptance is "migration and revocation model tests": every test here runs
against the migrated ``app_test`` database — so the migration is exercised on
every run — and between them the tests walk every state the table can be in:
live, idle-expired, absolutely expired, revoked, rotated, replaced, and the
family-wide revocation F029 will fire when a superseded session ID is replayed.

The invariants are asserted against PostgreSQL's own behaviour — the
``IntegrityError`` must name the constraint — not against the model's opinion
of them. That is the point of putting them in DDL: they hold for writers the
application never sees.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_session_token, hash_session_token
from app.models import User, UserSession

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

# A fixed "present" for the expiry rules. Dates are the caller's, never the
# model's: `is_active(now)` takes the instant it is asked about.
NOW = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)


def make_user(email: str = "ada@example.com", **overrides: object) -> User:
    values: dict[str, object] = {
        "email": email,
        "full_name": "Ada Lovelace",
        "hashed_password": "$argon2id$placeholder",
        **overrides,
    }
    return User(**values)


def make_session(user_id: uuid.UUID, **overrides: object) -> UserSession:
    """A valid row, built the way F028 will build it: a fresh token, hashed."""
    values: dict[str, object] = {
        "user_id": user_id,
        "token_hash": hash_session_token(generate_session_token()),
        "family_id": uuid.uuid4(),
        "absolute_expires_at": NOW + timedelta(days=30),
        "idle_expires_at": NOW + timedelta(hours=12),
        **overrides,
    }
    return UserSession(**values)


async def test_a_session_gets_a_database_generated_uuid_and_utc_instants(
    session: AsyncSession,
) -> None:
    user = make_user()
    session.add(user)
    await session.flush()
    session.add(make_session(user.id))
    await session.flush()

    row = (await session.scalars(select(UserSession))).one()
    assert isinstance(row.id, uuid.UUID)
    assert row.id.version == 7
    for column in ("created_at", "updated_at", "absolute_expires_at", "idle_expires_at"):
        assert getattr(row, column).utcoffset() == timedelta(0), column


async def test_the_token_hash_is_the_lookup_key_and_is_unique(session: AsyncSession) -> None:
    user = make_user()
    session.add(user)
    await session.flush()

    token_hash = hash_session_token(generate_session_token())
    session.add(make_session(user.id, token_hash=token_hash))
    await session.flush()
    session.add(make_session(user.id, token_hash=token_hash))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ix_sessions_token_hash" in str(caught.value.orig)


@pytest.mark.parametrize(
    ("label", "token_hash"),
    [
        # What a developer would produce by storing the cookie's value.
        ("the raw cookie value itself", generate_session_token()),
        ("a truncated digest", "a" * 63),
        ("an uppercase digest", "A" * 64),
    ],
)
async def test_only_a_sha256_hex_digest_is_accepted(
    session: AsyncSession, label: str, token_hash: str
) -> None:
    user = make_user()
    session.add(user)
    await session.flush()
    session.add(make_session(user.id, token_hash=token_hash))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_sessions_token_hash_is_sha256_hex" in str(caught.value.orig)


async def test_sessions_belong_to_a_real_user(session: AsyncSession) -> None:
    session.add(make_session(uuid.uuid4()))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_sessions_user_id_users" in str(caught.value.orig)


async def test_deleting_a_user_takes_their_sessions_with_them(session: AsyncSession) -> None:
    user = make_user()
    session.add(user)
    await session.flush()
    session.add_all([make_session(user.id), make_session(user.id)])
    await session.flush()

    await session.execute(delete(User).where(User.id == user.id))

    assert await session.scalar(select(func.count()).select_from(UserSession)) == 0


async def test_the_idle_deadline_cannot_outlive_the_absolute_one(session: AsyncSession) -> None:
    user = make_user()
    session.add(user)
    await session.flush()

    absolute = NOW + timedelta(days=30)
    # Equality is the legal boundary: idle may meet absolute, not pass it.
    session.add(make_session(user.id, absolute_expires_at=absolute, idle_expires_at=absolute))
    await session.flush()

    session.add(
        make_session(
            user.id,
            absolute_expires_at=absolute,
            idle_expires_at=absolute + timedelta(seconds=1),
        )
    )
    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_sessions_idle_deadline_within_absolute" in str(caught.value.orig)


@pytest.mark.parametrize(
    ("label", "overrides"),
    [
        ("revoked without a reason", {"revoked_at": NOW}),
        ("a reason without a revocation", {"revoked_reason": "logout"}),
    ],
)
async def test_revocation_is_all_or_nothing(
    session: AsyncSession, label: str, overrides: dict[str, object]
) -> None:
    user = make_user()
    session.add(user)
    await session.flush()
    session.add(make_session(user.id, **overrides))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_sessions_revocation_is_complete" in str(caught.value.orig)


async def test_revocation_reasons_are_a_closed_vocabulary(session: AsyncSession) -> None:
    user = make_user()
    session.add(user)
    await session.flush()
    # A plausible near-miss, not a random string: the vocabulary is what F029
    # matches on, so "almost the right word" must be as impossible as garbage.
    session.add(make_session(user.id, revoked_at=NOW, revoked_reason="logged_out"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_sessions_revoked_reason_is_known" in str(caught.value.orig)


async def test_a_rotation_links_a_predecessor_to_its_successor_once(session: AsyncSession) -> None:
    user = make_user()
    session.add(user)
    await session.flush()

    predecessor = make_session(user.id)
    successor = make_session(user.id, family_id=predecessor.family_id)
    other = make_session(user.id)
    session.add_all([predecessor, successor, other])
    await session.flush()

    # The F029 rotation step: revoke and point at the successor, atomically.
    predecessor.revoked_at = NOW
    predecessor.revoked_reason = "rotated"
    predecessor.replaced_by_id = successor.id
    await session.flush()

    # A session replaces exactly one predecessor — two rows claiming the same
    # successor is a fork, and forks are not a rotation.
    other.replaced_by_id = successor.id
    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ix_sessions_replaced_by_id" in str(caught.value.orig)


async def test_deleting_a_successor_leaves_the_predecessors_revocation_intact(
    session: AsyncSession,
) -> None:
    user = make_user()
    session.add(user)
    await session.flush()

    predecessor = make_session(user.id)
    successor = make_session(user.id, family_id=predecessor.family_id)
    session.add_all([predecessor, successor])
    await session.flush()
    predecessor.revoked_at = NOW
    predecessor.revoked_reason = "rotated"
    predecessor.replaced_by_id = successor.id
    await session.flush()

    await session.execute(delete(UserSession).where(UserSession.id == successor.id))
    await session.refresh(predecessor)

    # ON DELETE SET NULL: the chain loses its forward link, never its history.
    assert predecessor.replaced_by_id is None
    assert predecessor.revoked_reason == "rotated"
    assert predecessor.revoked_at is not None


async def test_replaying_a_rotated_id_revokes_the_whole_family(session: AsyncSession) -> None:
    """F029's theft-detection rehearsal, as a model-level test.

    A replay means a superseded member's ID was presented again: the response
    is to end every *live* member of that family at once, while leaving the
    already-rotated member's own reason alone — the record of what happened
    first must survive the record of what happened next. A different family
    must not be touched.
    """
    user = make_user()
    session.add(user)
    await session.flush()

    family = uuid.uuid4()
    first = make_session(user.id, family_id=family)
    successor = make_session(user.id, family_id=family)
    unrelated = make_session(user.id)
    session.add_all([first, successor, unrelated])
    await session.flush()

    first.revoked_at = NOW
    first.revoked_reason = "rotated"
    first.replaced_by_id = successor.id
    await session.commit()

    # The replay response: revoke what is still live in the family.
    await session.execute(
        update(UserSession)
        .where(UserSession.family_id == family, UserSession.revoked_at.is_(None))
        .values(revoked_at=NOW, revoked_reason="theft_detected")
    )

    # populate_existing: the bulk UPDATE bypassed the identity map, so re-read
    # what the database actually holds rather than trusting cached attributes.
    rows = {
        row.id: row
        for row in await session.scalars(
            select(UserSession).execution_options(populate_existing=True)
        )
    }
    assert rows[first.id].revoked_reason == "rotated"
    assert rows[successor.id].revoked_reason == "theft_detected"
    assert rows[unrelated.id].revoked_at is None
    assert not rows[first.id].is_active(NOW)
    assert not rows[successor.id].is_active(NOW)
    assert rows[unrelated.id].is_active(NOW)


async def test_is_active_follows_revocation_and_both_deadlines(session: AsyncSession) -> None:
    user = make_user()
    session.add(user)
    await session.flush()

    live = make_session(user.id)
    revoked = make_session(user.id, revoked_at=NOW, revoked_reason="logout")
    idle_passed = make_session(user.id, idle_expires_at=NOW - timedelta(seconds=1))
    absolute_passed = make_session(
        user.id,
        absolute_expires_at=NOW - timedelta(days=1),
        idle_expires_at=NOW - timedelta(days=1),
    )
    at_the_deadline = make_session(
        user.id,
        absolute_expires_at=NOW,
        idle_expires_at=NOW,
    )
    session.add_all([live, revoked, idle_passed, absolute_passed, at_the_deadline])
    await session.flush()

    assert live.is_active(NOW) is True
    assert revoked.is_active(NOW) is False
    assert idle_passed.is_active(NOW) is False
    assert absolute_passed.is_active(NOW) is False
    # Deadlines are strict: at the instant of expiry the session is over.
    assert at_the_deadline.is_active(NOW) is False
