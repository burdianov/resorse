"""The rate_limit_buckets table: throttling counters that survive a restart.

No Redis by decree (ARCHITECTURE §8), so the counter is a row. The shape is a
**fixed-window bucket**: one row per key, holding the window it belongs to and
the number of hits in it. Login throttling (F028) is therefore two keys —
``login:account:<email>`` and ``login:ip:<address>`` — not a second table:
BP-8.2h allows ``login_attempts`` *or* ``rate_limit_buckets``, and the generic
one is strictly more useful (F060 can throttle any other endpoint the same
way). There is deliberately no per-attempt ledger here: individual security
*events* belong to the audit trail (F045), where they can carry actor and
request context; a bucket only answers "how many, how recently".

The row-per-key property is what keeps the table small: when a window rolls
over, the next hit *rewrites* the same row (count back to 1) instead of
appending one. Rows for keys nobody touches again are inert — cheap enough
that pruning can wait for the task that owns maintenance (F060).

``hit_count >= 1`` is a real invariant, not decoration: a bucket exists only
because something was counted, and a zero would be a row claiming "no attempts
in this window" — a state that should simply not exist. The atomic upsert in
``app/core/rate_limit.py`` never writes one.
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class RateLimitBucket(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "rate_limit_buckets"
    __table_args__ = (
        # The upsert's conflict target, and the only lookup this table has.
        Index(None, "bucket_key", unique=True),
        CheckConstraint("hit_count >= 1", name="hit_count_is_positive"),
    )

    # 400 = the longest key the helpers can build ("login:account:" + a
    # 320-character email) with room to spare. A caller that invents longer
    # keys gets a loud DataError instead of silent truncation — which is the
    # correct failure for a key that would otherwise split one budget in two.
    bucket_key: Mapped[str] = mapped_column(String(400), nullable=False)

    # The start of the fixed window this count belongs to. When a request
    # arrives in a *different* window, the upsert resets the row to this new
    # start with a count of one.
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    hit_count: Mapped[int] = mapped_column(nullable=False, server_default=text("1"))
