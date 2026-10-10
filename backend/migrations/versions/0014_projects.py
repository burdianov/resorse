"""projects

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-10 23:52:11.104377

The fourth domain revision, and the first that is not a reference list (D007;
DOMAIN_ARCHITECTURE §2's `projects` row). The number is read from the
directory, never from a plan (D001 §5).

Creates one table, `projects`, exactly as `app/models/projects.py` declares it:
UUID v7 primary key from the database, `timestamptz` instants, three CHECKs
that are about presence and the closed status vocabulary, **two date CHECKs**,
one nullable foreign key to `users`, and a **partial** unique index on `code`.

Three things here are deliberate and are what the task's acceptance reads:

- **Three `Date` columns**, the first in this tree. A project's start and its
  two completions are calendar days (F023's instant convention is about
  events); storing them as `timestamptz` would invent a time zone nobody has.
- **`status <> 'retired'` in the index predicate.** The unique index is
  partial because awarding a tender creates a second row that reuses the
  retired tender's code (C57, O15, DOMAIN_ARCHITECTURE §3's rule table). A
  full unique index would refuse exactly the conversion the product is built
  around, so the predicate is the rule and not an optimisation.
- **`ON DELETE RESTRICT` on `responsible_user_id`.** The column is what
  `own-project` scope resolves against (DOMAIN_ARCHITECTURE §3), so the
  database refuses to blank it silently. `SET NULL` was rejected: the product
  soft-deletes users (C22), so a hard delete is deliberate surgery, and erasing
  an answerable person is not a state this table represents.

**No rows are inserted here, deliberately.** No specification names an initial
project, so `alembic upgrade head` leaves this table empty and that is its
finished state; `app/seed.py` writes nothing here, so a seed run over a
migrated database stays a no-op.

Hand-checked against the model rather than trusted to autogenerate: the
partial index predicate is the piece a generated revision tends to lose, and
`alembic check` afterwards is what proves the two agree.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("contractual_completion", sa.Date(), nullable=False),
        sa.Column("forecast_completion", sa.Date(), nullable=False),
        sa.Column("responsible_user_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "length(trim(code)) > 0",
            name=op.f("ck_projects_code_is_present"),
        ),
        sa.CheckConstraint(
            "length(trim(name)) > 0",
            name=op.f("ck_projects_name_is_present"),
        ),
        sa.CheckConstraint(
            "status IN ('tender', 'awarded', 'retired')",
            name=op.f("ck_projects_status_is_known"),
        ),
        sa.CheckConstraint(
            "contractual_completion >= start_date",
            name=op.f("ck_projects_contractual_completion_is_not_before_start"),
        ),
        sa.CheckConstraint(
            "forecast_completion >= start_date",
            name=op.f("ck_projects_forecast_completion_is_not_before_start"),
        ),
        sa.ForeignKeyConstraint(
            ["responsible_user_id"],
            ["users.id"],
            name=op.f("fk_projects_responsible_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_projects")),
    )
    # Partial on purpose: the code is unique among *live* projects, so an
    # awarded project may reuse its retired tender's code (C57).
    op.create_index(
        op.f("ix_projects_code"),
        "projects",
        ["code"],
        unique=True,
        postgresql_where=sa.text("status <> 'retired'"),
    )
    op.create_index(
        op.f("ix_projects_responsible_user_id"),
        "projects",
        ["responsible_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_projects_responsible_user_id"), table_name="projects")
    op.drop_index(
        op.f("ix_projects_code"),
        table_name="projects",
        postgresql_where=sa.text("status <> 'retired'"),
    )
    op.drop_table("projects")
