"""The rate-limit primitives (F026).

Two kinds of test, for the two kinds of claim the module makes:

- the **window math** is pure, so it is tested without a database, including
  the boundary instants a caller will never think about until they matter;
- the **counter** is a SQL statement, so it is tested against real PostgreSQL
  — and the concurrency test at the end races twelve real connections, because
  "two logins racing must both count" is the property the atomic upsert exists
  for. That one test opens its own connections (a single fixture transaction
  cannot race itself) and removes exactly what it wrote; every other test uses
  the shared rollback fixture (F024).

Tests here mix sync and async functions, so the asyncio mark is per test
rather than at module level.
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.rate_limit import (
    RateLimitRule,
    account_key,
    clear,
    hit,
    ip_key,
    peek,
    retry_after_seconds,
    window_start_for,
)
from app.models import RateLimitBucket

# 12:07 on a 15-minute grid: comfortably inside the 12:00–12:15 window.
NOW = datetime(2026, 10, 10, 12, 7, tzinfo=UTC)
RULE = RateLimitRule(limit=5, window=timedelta(minutes=15))
KEY = "test:bucket"


# --- the window math, no database --------------------------------------------


def test_windows_are_epoch_aligned_and_stable() -> None:
    quarter = timedelta(minutes=15)

    assert window_start_for(NOW, quarter) == datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    # An exact boundary belongs to the window it opens, not the one it closes.
    assert window_start_for(datetime(2026, 10, 10, 12, 15, tzinfo=UTC), quarter) == datetime(
        2026, 10, 10, 12, 15, tzinfo=UTC
    )
    assert window_start_for(
        datetime(2026, 10, 10, 12, 14, 59, 999_999, tzinfo=UTC), quarter
    ) == datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    # Alignment does not depend on when the first request happened: midnight
    # is a boundary for a one-day window.
    assert window_start_for(NOW, timedelta(days=1)) == datetime(2026, 10, 10, tzinfo=UTC)


def test_naive_instants_are_rejected() -> None:
    # Instants in this codebase are UTC-aware; a silent local-time window
    # would misplace every boundary. Naive input is a TypeError, loudly.
    with pytest.raises(TypeError):
        window_start_for(datetime(2026, 10, 10, 12, 7), timedelta(minutes=15))  # noqa: DTZ001


def test_retry_after_counts_to_the_end_of_the_window() -> None:
    start = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)

    assert retry_after_seconds(NOW, start, timedelta(minutes=15)) == 8 * 60
    # Rounded up: 0 would tell the client to retry into the same window.
    assert (
        retry_after_seconds(
            datetime(2026, 10, 10, 12, 14, 59, 500_000, tzinfo=UTC), start, timedelta(minutes=15)
        )
        == 1
    )
    # A clock slightly ahead of the boundary floors at zero, never negative.
    assert (
        retry_after_seconds(
            datetime(2026, 10, 10, 12, 16, tzinfo=UTC), start, timedelta(minutes=15)
        )
        == 0
    )


def test_rules_refuse_nonsense() -> None:
    with pytest.raises(ValueError):
        RateLimitRule(limit=0, window=timedelta(minutes=1))
    with pytest.raises(ValueError):
        RateLimitRule(limit=5, window=timedelta(0))


def test_key_helpers_namespace_and_canonicalise() -> None:
    assert account_key(" Ada@Example.com ") == "login:account:ada@example.com"
    assert ip_key("203.0.113.7") == "login:ip:203.0.113.7"


# --- the counter, against real PostgreSQL ------------------------------------


@pytest.mark.asyncio
async def test_a_first_hit_creates_the_bucket(session) -> None:
    status = await hit(session, KEY, RULE, now=NOW)

    assert status.count == 1
    assert status.allowed is True
    assert status.retry_after_seconds == 0


@pytest.mark.asyncio
async def test_the_limit_is_inclusive_and_the_next_hit_is_denied(session) -> None:
    for _ in range(RULE.limit):
        status = await hit(session, KEY, RULE, now=NOW)
        assert status.allowed is True, status

    denied = await hit(session, KEY, RULE, now=NOW)
    assert denied.allowed is False
    assert denied.count == RULE.limit + 1
    # Denial carries the rest of the window, which is what a 429 answers with.
    assert denied.retry_after_seconds == 8 * 60


@pytest.mark.asyncio
async def test_a_new_window_reuses_the_row_and_starts_over(session) -> None:
    for _ in range(RULE.limit + 1):
        await hit(session, KEY, RULE, now=NOW)

    status = await hit(session, KEY, RULE, now=NOW + timedelta(minutes=15))

    assert status.count == 1
    assert status.allowed is True
    # One row per key, rewritten on rollover — not one row per hit.
    rows = await session.scalar(
        select(func.count()).select_from(RateLimitBucket).where(RateLimitBucket.bucket_key == KEY)
    )
    assert rows == 1


@pytest.mark.asyncio
async def test_budgets_are_per_key(session) -> None:
    await hit(session, account_key("ada@example.com"), RULE, now=NOW)

    assert await peek(session, account_key("grace@example.com"), RULE, now=NOW) == 0
    assert await peek(session, ip_key("203.0.113.7"), RULE, now=NOW) == 0
    assert await peek(session, account_key("ada@example.com"), RULE, now=NOW) == 1


@pytest.mark.asyncio
async def test_peek_counts_without_incrementing_and_respects_windows(session) -> None:
    assert await peek(session, KEY, RULE, now=NOW) == 0

    await hit(session, KEY, RULE, now=NOW)
    await hit(session, KEY, RULE, now=NOW)

    assert await peek(session, KEY, RULE, now=NOW) == 2
    assert await peek(session, KEY, RULE, now=NOW) == 2
    # A bucket from an earlier window reads as empty, not as its old count.
    assert await peek(session, KEY, RULE, now=NOW + timedelta(minutes=15)) == 0


@pytest.mark.asyncio
async def test_clear_forgets_the_budget(session) -> None:
    await hit(session, KEY, RULE, now=NOW)

    assert await clear(session, KEY) is True
    assert await peek(session, KEY, RULE, now=NOW) == 0
    assert await clear(session, KEY) is False


CONCURRENT_HITS = 12


@pytest.mark.asyncio
async def test_concurrent_hits_do_not_lose_updates(test_database_url: str) -> None:
    """Twelve real connections race one key; every hit must count.

    This is the test the atomic upsert exists for: a SELECT-then-UPDATE
    implementation passes every other test in this file and fails this one.
    It needs its own engine and committed transactions — one fixture
    transaction cannot race itself — so it uses a unique key and deletes
    exactly its own row afterwards.
    """
    engine = create_async_engine(test_database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    key = f"test:concurrency:{uuid.uuid4()}"
    rule = RateLimitRule(limit=1_000, window=timedelta(minutes=15))

    async def one_hit() -> int:
        async with maker() as own:
            status = await hit(own, key, rule, now=NOW)
            await own.commit()
            return status.count

    try:
        counts = await asyncio.gather(*(one_hit() for _ in range(CONCURRENT_HITS)))
        # Each racing statement returned a distinct count: the row lock
        # serialized them and the CASE evaluated against the current row.
        assert sorted(counts) == list(range(1, CONCURRENT_HITS + 1))
    finally:
        async with maker() as cleanup:
            await cleanup.execute(delete(RateLimitBucket).where(RateLimitBucket.bucket_key == key))
            await cleanup.commit()
        await engine.dispose()
