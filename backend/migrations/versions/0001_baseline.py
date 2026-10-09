"""baseline - the migration chain's root

Revision ID: 0001
Revises:
Create Date: 2026-10-09

Creates no tables, on purpose. F023's deliverable is the machinery and the
conventions every later migration is written against — naming, UUID primary
keys, ``timestamptz`` instants (``app/core/database.py``) — proven end to end
by applying this revision to an empty database and taking it back down again.
The first tables arrive with the task that owns them (F024: users, roles,
permissions and their join tables), each in its own revision, so the chain
stays readable and every table has one author.

The side effect of applying it is real: the ``alembic_version`` table appears,
which is what lets ``alembic upgrade head`` be a no-op on the second run.
"""

from collections.abc import Sequence

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
