"""cost centres

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-11 09:12:00.000000

The projects group's second table (D010; DOMAIN_ARCHITECTURE §2's
`cost_centres` row). The number is read from the directory, never from a plan
(D001 §5) — `0015` was the head when this was written.

Creates one table, `cost_centres`, exactly as `app/models/projects.py` declares
it: UUID v7 primary key from the database, `timestamptz` instants, a nullable
foreign key to `projects`, three CHECKs, and **two partial unique indexes**.

Three things here are deliberate and are what the task's acceptance reads:

- **`UNIQUE (kind) WHERE kind = 'HEAD_OFFICE'`.** The map's rule is that there
  is exactly one Head Office cost centre. A CHECK cannot count rows, so a
  unique index over the kind column, restricted to the one kind it constrains,
  is the only spelling of that rule the database can hold. Two Head Office rows
  would be two answers to a question the product says has one answer.
- **`UNIQUE (project_id) WHERE kind = 'PROJECT'`.** One cost centre per
  project. Partial because the rule is about project kinds only — the predicate
  says which rows it governs, rather than relying on Postgres treating `NULL`s
  as distinct.
- **The reference CHECK, `project_reference_matches_kind`.** A Head Office row
  names no project and a project row names exactly one, so the kind and the
  reference are a single fact the database can refuse to split. Without it
  `(PROJECT, NULL)` is writable: a project's cost centre belonging to no
  project.

The foreign key is **`ON DELETE RESTRICT`**: this is the first table that
references `projects`, so deleting a project now has a database-level reason to
be refused. Nothing in the API creates a project's cost centre yet, so that
refusal stays unreachable through the service — D008's record of it as
unreachable is still accurate, and this table is what will make it reachable
rather than a correction to make now.

**The Head Office row does not ship here.** It is reference data the product
names, so it is the seed's (`app/seed.py`, D010) and this revision leaves the
table empty. An operator with a migrated database and no seed has no Head
Office cost centre; that is a seed that has not been run, not a schema that is
wrong — the same split F033's reference rows follow.

Hand-checked against the model rather than trusted to autogenerate: the two
partial index predicates are the piece a generated revision tends to lose, and
`alembic check` afterwards is what proves the two agree.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cost_centres",
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
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
            "length(trim(name)) > 0",
            name=op.f("ck_cost_centres_name_is_present"),
        ),
        sa.CheckConstraint(
            "kind IN ('HEAD_OFFICE', 'PROJECT')",
            name=op.f("ck_cost_centres_kind_is_known"),
        ),
        sa.CheckConstraint(
            "(kind = 'HEAD_OFFICE' AND project_id IS NULL)"
            " OR (kind = 'PROJECT' AND project_id IS NOT NULL)",
            name=op.f("ck_cost_centres_project_reference_matches_kind"),
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_cost_centres_project_id_projects"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cost_centres")),
    )
    # The map's "exactly one Head Office row": a CHECK cannot count rows, so the
    # rule is a uniqueness the database enforces over the kind it names.
    op.create_index(
        op.f("ix_cost_centres_kind"),
        "cost_centres",
        ["kind"],
        unique=True,
        postgresql_where=sa.text("kind = 'HEAD_OFFICE'"),
    )
    # …and one cost centre per project, partial for the same reason the project
    # code index is (D007): the predicate states the rule.
    op.create_index(
        op.f("ix_cost_centres_project_id"),
        "cost_centres",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'PROJECT'"),
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_cost_centres_project_id"),
        table_name="cost_centres",
        postgresql_where=sa.text("kind = 'PROJECT'"),
    )
    op.drop_index(
        op.f("ix_cost_centres_kind"),
        table_name="cost_centres",
        postgresql_where=sa.text("kind = 'HEAD_OFFICE'"),
    )
    op.drop_table("cost_centres")
