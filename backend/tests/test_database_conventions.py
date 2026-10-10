"""The schema conventions, proven without a database.

The migration machinery is verified by running it (``uv run alembic upgrade
head``). What a unit test can pin down is the part that only hurts later: that
the conventions every future table inherits are the ones we believe they are.
A wrong primary-key type or a missing naming convention surfaces weeks later,
in a migration that can no longer be rewritten.

These are the *only* database tests that need no PostgreSQL; anything touching
real rows and constraints belongs with the task that owns the table (F024+),
against the real database (BIG-PROMPT §10.2).
"""

import uuid
from typing import Any

from sqlalchemy import DateTime, ForeignKey, FromClause, String, UniqueConstraint, Uuid
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.schema import CreateTable

from app.core.database import NAMING_CONVENTION, TimestampMixin, UUIDPrimaryKeyMixin
from app.core.database import Base as ApplicationBase


class ConventionParent(UUIDPrimaryKeyMixin, TimestampMixin, ApplicationBase):
    __tablename__ = "convention_parent"

    name: Mapped[str] = mapped_column(String(50), nullable=False)


class ConventionChild(UUIDPrimaryKeyMixin, TimestampMixin, ApplicationBase):
    __tablename__ = "convention_child"
    # Unnamed on purpose: the naming convention is what turns this into
    # `uq_convention_child_parent_id_label` in the database.
    __table_args__ = (UniqueConstraint("parent_id", "label"),)

    parent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("convention_parent.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)


def test_primary_keys_are_database_generated_uuid_v7() -> None:
    column = ConventionParent.__table__.c.id

    assert column.primary_key is True
    assert isinstance(column.type, Uuid)
    assert column.server_default is not None
    assert "uuidv7()" in str(column.server_default.arg)


def test_timestamps_are_timezone_aware_instants() -> None:
    table = ConventionParent.__table__

    for name in ("created_at", "updated_at"):
        column = table.c[name]
        assert isinstance(column.type, DateTime)
        assert column.type.timezone is True
        assert column.server_default is not None
        assert column.nullable is False

    # updated_at also moves on an ORM update; created_at must not.
    assert table.c.updated_at.onupdate is not None
    assert table.c.created_at.onupdate is None


def test_the_naming_convention_is_the_one_we_think() -> None:
    assert ApplicationBase.metadata.naming_convention == NAMING_CONVENTION
    assert NAMING_CONVENTION["pk"] == "pk_%(table_name)s"


def ddl_for(table: FromClause[Any]) -> str:
    """DDL as PostgreSQL renders it.

    Compiling without a dialect gives the *generic* form — ``DATETIME`` and
    ``CHAR(32)`` — which is not what this project's database sees. The dialect
    is part of the assertion.
    """
    # Two separate upstream facts, so two ignores rather than one broad one:
    # a declarative class's `__table__` is annotated `FromClause` while
    # `CreateTable` takes a `Table` (at runtime it always *is* one), and
    # `ClauseElement.compile` ships without annotations in SQLAlchemy 2.1.
    statement = CreateTable(table)  # type: ignore[arg-type]
    compiled = statement.compile(dialect=postgresql.dialect())  # type: ignore[no-untyped-call]
    return str(compiled)


def test_unnamed_constraints_reach_postgresql_with_stable_names() -> None:
    ddl = ddl_for(ConventionChild.__table__)

    assert "CONSTRAINT pk_convention_child PRIMARY KEY (id)" in ddl
    assert "CONSTRAINT uq_convention_child_parent_id_label UNIQUE (parent_id, label)" in ddl
    assert "CONSTRAINT fk_convention_child_parent_id_convention_parent FOREIGN KEY" in ddl


def test_instants_are_stored_as_timestamptz() -> None:
    ddl = ddl_for(ConventionParent.__table__)

    assert ddl.count("TIMESTAMP WITH TIME ZONE") == 2
    assert "UUID DEFAULT uuidv7()" in ddl
