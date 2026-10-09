"""Fixed-window rate limiting, backed by PostgreSQL (F026).

There is no Redis (ARCHITECTURE §8), so the counter is a row and latency is a
query — which makes **concurrency** the whole design problem: two login
attempts racing on the same account must both count, or the throttle is a
formality. The answer is one atomic statement, not a lock:

    INSERT INTO rate_limit_buckets (bucket_key, window_start, hit_count, ...)
    VALUES (:key, :window_start, 1, ...)
    ON CONFLICT (bucket_key) DO UPDATE
       SET hit_count = CASE WHEN old.window_start = new.window_start
                            THEN old.hit_count + 1 ELSE 1 END,
           window_start = new.window_start
    RETURNING hit_count

Concurrent requests serialize on the row lock and the CASE is evaluated
against the *current* row, so N simultaneous hits leave a count of N. No
SELECT-then-UPDATE window exists to lose an update in, and there is no
optimistic-retry loop to write or to test. (``test_rate_limit.py`` proves it
with real concurrent connections rather than asserting the shape.)

A **fixed** window is the honest simple choice: aligned to the epoch, so the
window does not depend on when the first request happened to arrive (which
would make two servers—or two test runs—disagree). Its known cost is the
boundary burst: a caller can spend the full budget just before a window ends
and the full budget again just after. For login throttling that is acceptable
and documented; a sliding window would need either a row per hit or a lock
held across statements, and neither buys anything a lockout is for.

The clock is a parameter (``now=``), not an ambient read: the caller decides
what "now" is. Tests drive it; F028 supplies the real instants; nothing here
knows the wall time except the default.
"""

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rate_limit import RateLimitBucket

# Windows are aligned to the Unix epoch (see window_start_for).
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# The key vocabulary. F028 writes these buckets and F060 may read them; one
# spelling shared by both beats two that almost match.
ACCOUNT_KEY_PREFIX = "login:account:"
IP_KEY_PREFIX = "login:ip:"


def account_key(email: str) -> str:
    """Bucket key for one account's login attempts.

    The email is lowercased defensively: the database already stores canonical
    lowercase (F024), and if a caller ever forgets, the failure would not be an
    error — it would be two buckets for one account and half the intended
    throttle. The key canonicalises itself instead of trusting that.
    """
    return ACCOUNT_KEY_PREFIX + email.strip().lower()


def ip_key(address: str) -> str:
    """Bucket key for one source address. The caller passes the client IP as
    the server sees it; parsing is F028's concern."""
    return IP_KEY_PREFIX + address


@dataclass(frozen=True)
class RateLimitRule:
    """A budget: ``limit`` hits are allowed per ``window``."""

    limit: int
    window: timedelta

    def __post_init__(self) -> None:
        if self.limit < 1:
            raise ValueError("A rate limit needs a limit of at least 1.")
        if self.window <= timedelta(0):
            raise ValueError("A rate limit needs a positive window.")


@dataclass(frozen=True)
class RateLimitStatus:
    """The outcome of one :func:`hit` — everything a 429 needs to answer.

    ``count`` includes the hit being answered. ``retry_after_seconds`` is the
    remainder of the current window when the hit was *denied* (the value for a
    ``Retry-After`` header) and 0 when it was allowed.
    """

    key: str
    count: int
    limit: int
    allowed: bool
    retry_after_seconds: int


def window_start_for(now: datetime, window: timedelta) -> datetime:
    """The start of the fixed window containing ``now``.

    Epoch-aligned, so every process and every test agrees on where windows
    begin, and a window boundary is a fact of the clock rather than of the
    first request. A naive ``now`` raises (subtracting the aware epoch is a
    ``TypeError``): instants in this codebase are UTC-aware, and a silent
    conversion here would misplace every window.
    """
    elapsed = now - EPOCH
    return EPOCH + (elapsed // window) * window


def retry_after_seconds(now: datetime, window_start: datetime, window: timedelta) -> int:
    """Whole seconds until the window containing ``window_start`` ends.

    Rounded up, because ``Retry-After: 0`` tells a client to retry immediately
    into the same expired window; and floored at zero, because reading a clock
    slightly ahead of the row's must not produce a negative header.
    """
    remaining = (window_start + window) - now
    return max(0, math.ceil(remaining.total_seconds()))


async def hit(
    session: AsyncSession,
    key: str,
    rule: RateLimitRule,
    *,
    now: datetime | None = None,
) -> RateLimitStatus:
    """Count one hit against ``key`` and answer whether it is allowed.

    The whole decision is the single upsert below; the caller (F028) decides
    what a denied hit *means* — for login, a 429 with the same body whether or
    not the account exists (BP-6.2g: no enumeration).
    """
    moment = datetime.now(UTC) if now is None else now
    start = window_start_for(moment, rule.window)

    statement = (
        pg_insert(RateLimitBucket)
        .values(bucket_key=key, window_start=start, hit_count=1)
        .on_conflict_do_update(
            index_elements=[RateLimitBucket.bucket_key],
            set_={
                # `RateLimitBucket.window_start` is the *existing* row here;
                # the CASE compares it against the window of this hit.
                "hit_count": case(
                    (RateLimitBucket.window_start == start, RateLimitBucket.hit_count + 1),
                    else_=1,
                ),
                "window_start": start,
                # TimestampMixin's onupdate is ORM-side and does not fire for a
                # Core statement, so the touch is explicit.
                "updated_at": func.now(),
            },
        )
        .returning(RateLimitBucket.hit_count)
    )
    count = (await session.execute(statement)).scalar_one()

    allowed = count <= rule.limit
    return RateLimitStatus(
        key=key,
        count=count,
        limit=rule.limit,
        allowed=allowed,
        retry_after_seconds=0 if allowed else retry_after_seconds(moment, start, rule.window),
    )


async def peek(
    session: AsyncSession,
    key: str,
    rule: RateLimitRule,
    *,
    now: datetime | None = None,
) -> int:
    """Hits already counted in the current window, without counting one.

    Window-aware: a bucket left behind by an earlier window reads as 0, so a
    caller never has to know when rows are stale.
    """
    moment = datetime.now(UTC) if now is None else now
    start = window_start_for(moment, rule.window)
    count = await session.scalar(
        select(RateLimitBucket.hit_count).where(
            RateLimitBucket.bucket_key == key,
            RateLimitBucket.window_start == start,
        )
    )
    return count or 0


async def clear(session: AsyncSession, key: str) -> bool:
    """Forget a bucket, answering whether there was one to forget.

    Whether a *successful* login resets the budget is the caller's policy
    (F028); the primitive only offers the operation. DELETE ... RETURNING (at
    most one row — the key is unique) rather than a rowcount, which is also
    what keeps this return value visible to the type checker.
    """
    deleted_id = await session.scalar(
        delete(RateLimitBucket)
        .where(RateLimitBucket.bucket_key == key)
        .returning(RateLimitBucket.id)
    )
    return deleted_id is not None
