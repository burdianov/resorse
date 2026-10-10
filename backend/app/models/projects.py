"""Projects — the work the rest of the product plans people against (D007).

The second Stage B table group, and the first one that is not a reference list.
``docs/DOMAIN_ARCHITECTURE.md`` §2 draws the row — ``code UQ, name, status
tender|awarded|retired, start_date, contractual_completion,
forecast_completion, responsible_user_id -> users NULLABLE`` — and §3's rules
table states the constraint that is specific to it: **a project code is unique
among live projects**, which is why the unique index below is *partial*.

Five choices worth stating because later tasks depend on them:

- **``code`` is the identity and ``name`` is the label**, as the reference
  tables have it, so correcting a project's display string is an edit. But a
  project code is **business data, not a machine key**: the specification gives
  it no shape (no slug rule, no width) and a real code looks like a contract
  number, so this module deliberately does not borrow the reference tables'
  ``^[a-z][a-z0-9_]*$`` CHECK. The rule §3 does state — uniqueness — is
  enforced where it belongs, by the index. Only presence is a CHECK.
- **Uniqueness is among live projects, so the index is partial.** Awarding a
  tender creates a *second* row: the awarded project takes the tender's code
  and the tender row is retired and kept as history (C57, O15). A plain unique
  index would make that conversion impossible; a service-side check would be a
  second implementation of a rule the database can hold. ``WHERE status <>
  'retired'`` is therefore not an optimisation — it is the rule, and the two
  rows C57 describes are exactly the case the index permits and a full one
  would refuse.
- **The dates are calendar days, not instants.** This is the first ``Date``
  column in the tree; every timestamp so far has been a ``timestamptz``
  instant (F023). A project's start and completions are days a contract names
  and the month arithmetic consumes (C55: a day is worth more in a short month
  than a long one), so storing an instant would invent a time zone and a time
  of day nobody has one for. ``contractual_completion`` and
  ``forecast_completion`` are **separate and independently editable** (C09) —
  the forecast is revised against a contractual date that does not move — so
  nothing here orders the two against each other. What the database does
  refuse is a completion before the start, on either column: that row is not a
  revised plan, it is a typo.
- **``responsible_user_id`` is nullable and restricted.** Nullable because a
  tender exists before anyone is answerable for it (D019 owns the linking);
  ``ON DELETE RESTRICT`` because the column is what ``own-project`` scope
  resolves against (DOMAIN_ARCHITECTURE §3) and the product soft-deletes users
  (C22), so a hard delete is deliberate surgery — silently blanking a
  responsibility would erase a fact rather than record one. Its index exists
  because the question "which projects is this user responsible for?" is asked
  from the user's side (D019 → D081), which the primary key cannot serve.
- **No rows ship.** No specification names an initial project, so the table is
  created empty and ``app/seed.py`` writes nothing here.

**Deliberately absent: the specification's "optional discipline metadata".**
``PRODUCT_SPEC`` §4 lists it among the project columns and the map's ERD does
not draw it (D001 §5: where the two disagree, the map wins and the task says
so). Nothing between D008 and D019 reads a project's discipline — plans are
classified by their rows' designations, and the consolidation filters (§7) read
those, not this table — so a column with no consumer is exactly the shape the
reference tables refuse. It is a migration when a task needs it.

The CHECKs are the floor under the service (the F024 pattern), and they are
what the database enforces whatever writes next, including a ``psql`` session.
"""

import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin

# Same width the reference tables' business codes use (DOMAIN_ARCHITECTURE §3
# groups them under one rule), but no pattern: see the module docstring.
MAX_CODE_LENGTH = 32
MAX_NAME_LENGTH = 200

# The project lifecycle, in the specification's own tokens (PRODUCT_SPEC §4).
# Lowercase, unlike ``department.classification``'s uppercase pair, because
# this is how the map spells it and how §3's rule table writes the index
# predicate — and the predicate below is built from this tuple, so the two
# cannot drift.
PROJECT_STATUSES = (
    "tender",
    "awarded",
    "retired",
)
RETIRED_STATUS = "retired"
MAX_STATUS_LENGTH = 16


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A tender, an awarded project, or a retired one — the same table.

    One table with a status rather than three, because C57's award is a
    *conversion* and not a move between entities: the tender row stays, the
    awarded row is created beside it, and the code the two share is what makes
    "this project's history" a single lookup. A project that has forecasts or
    assignments cannot be deleted at all (DOMAIN_ARCHITECTURE §2's write
    boundary); ``retired`` is what a tender becomes once it has been awarded,
    not a delete in disguise.
    """

    __tablename__ = "projects"
    __table_args__ = (
        # Partial, and the predicate is the rule (C57). Two live projects may
        # not share a code; the retired tender and its awarded successor do.
        Index(
            None,
            "code",
            unique=True,
            postgresql_where=text(f"status <> '{RETIRED_STATUS}'"),
        ),
        # "Which projects is this user responsible for?" — asked from the
        # user's side (D019 → D081), so the primary key cannot serve it.
        Index(None, "responsible_user_id"),
        CheckConstraint("length(trim(code)) > 0", name="code_is_present"),
        CheckConstraint("length(trim(name)) > 0", name="name_is_present"),
        CheckConstraint(
            "status IN (" + ", ".join(f"'{status}'" for status in PROJECT_STATUSES) + ")",
            name="status_is_known",
        ),
        # C09: the two completions are separate and neither is ordered against
        # the other. Both are after the start, which is what a typo violates.
        CheckConstraint(
            "contractual_completion >= start_date",
            name="contractual_completion_is_not_before_start",
        ),
        CheckConstraint(
            "forecast_completion >= start_date",
            name="forecast_completion_is_not_before_start",
        ),
    )

    code: Mapped[str] = mapped_column(String(MAX_CODE_LENGTH), nullable=False)
    name: Mapped[str] = mapped_column(String(MAX_NAME_LENGTH), nullable=False)
    # Required, and one of the three: a project with no lifecycle state is not
    # a row this table represents.
    status: Mapped[str] = mapped_column(String(MAX_STATUS_LENGTH), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    contractual_completion: Mapped[date] = mapped_column(Date, nullable=False)
    # Independently editable (C09): revised against a contractual date that
    # does not move, which is why no constraint ties the two together.
    forecast_completion: Mapped[date] = mapped_column(Date, nullable=False)
    # NULL until someone is answerable for it (D019). RESTRICT, not SET NULL:
    # see the module docstring.
    responsible_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    def __repr__(self) -> str:
        """Identity only — the F024 rule (a stray ``print`` must not put more
        in a log than a row's key)."""
        return f"Project(id={self.id!r}, code={self.code!r})"
