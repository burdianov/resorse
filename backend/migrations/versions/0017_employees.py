"""employees

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-11 14:05:00.000000

The `masters` group's fourth table (D011; DOMAIN_ARCHITECTURE §2's
`employees` row — `employee_id UQ, full_name, designation_id → designations,
status, hire/end dates`, with the `user_id` login link it draws beside it). The
number is read from the directory, never from a plan (D001 §5) — `0016` was the
head when this was written.

Creates one table, `employees`, exactly as `app/models/employees.py` declares
it: UUID v7 primary key from the database, `timestamptz` instants, a unique
index on the business id, two `Date` columns, two `NOT NULL`/`NULL` foreign
keys, four CHECKs and **one partial unique index**.

Four things here are deliberate and are what the task's acceptance reads:

- **`full_name` is one column.** `PRODUCT_SPEC` §3's "Do not split name" — no
  `first_name`, no `last_name`, and no pattern that assumes a name has parts.
  This is the whole of D011's acceptance: a split name is not a shape this
  schema can be in, rather than one a service declines to write.
- **`UNIQUE (user_id) WHERE user_id IS NOT NULL`.** One login per person,
  partial because the rule governs only the rows that have a link — most
  employees have none (PRODUCT_SPEC §3: "don't assume every employee can log
  in"), and the predicate states that rather than relying on Postgres treating
  `NULL`s as distinct.
- **`status IN ('ACTIVE', 'INACTIVE')`.** A closed two-value vocabulary, the
  `department.classification` shape. The specification's "active/employment
  status" is the state; the *event* of leaving is D059–D063's, and no boolean
  beside this column is added (C70's rule against two spellings of one fact).
- **`end_date >= hire_date`.** Both dates are optional, so a NULL on either
  side passes; what the database refuses is a row claiming someone left before
  they arrived — the date-ordering rule D007 applies to a project's completions.

Both foreign keys are **`ON DELETE RESTRICT`**: a designation that a person
still holds cannot be deleted out from under them (D004's policy), and the
account link is a fact about a login the product soft-deletes rather than
cascades (C22).

**No rows ship here.** The specification names no initial employees, so this
revision leaves the table empty and `app/seed.py` writes nothing to it.

Hand-written rather than trusted to autogenerate, on `0014`'s and `0016`'s
precedent — the partial predicate is the piece a generated revision tends to
lose — and `alembic check` afterwards is what proves the two agree.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "employees",
        sa.Column("employee_id", sa.String(length=32), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("designation_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("hire_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
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
            "length(trim(employee_id)) > 0",
            name=op.f("ck_employees_employee_id_is_present"),
        ),
        sa.CheckConstraint(
            "length(trim(full_name)) > 0",
            name=op.f("ck_employees_full_name_is_present"),
        ),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'INACTIVE')",
            name=op.f("ck_employees_status_is_known"),
        ),
        sa.CheckConstraint(
            "end_date >= hire_date",
            name=op.f("ck_employees_end_date_is_not_before_hire_date"),
        ),
        sa.ForeignKeyConstraint(
            ["designation_id"],
            ["designations.id"],
            name=op.f("fk_employees_designation_id_designations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_employees_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employees")),
    )
    op.create_index(op.f("ix_employees_employee_id"), "employees", ["employee_id"], unique=True)
    op.create_index(
        op.f("ix_employees_designation_id"), "employees", ["designation_id"], unique=False
    )
    # One login per person, over the rows that have one (the model's comment).
    op.create_index(
        op.f("ix_employees_user_id"),
        "employees",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_employees_user_id"),
        table_name="employees",
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )
    op.drop_index(op.f("ix_employees_designation_id"), table_name="employees")
    op.drop_index(op.f("ix_employees_employee_id"), table_name="employees")
    op.drop_table("employees")
