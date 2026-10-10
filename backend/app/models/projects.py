"""Projects and what their cost is charged to (D007, D010).

The second Stage B table group, and the first one that is not a reference list.
``docs/DOMAIN_ARCHITECTURE.md`` §2 draws the first table — ``code UQ, name,
status tender|awarded|retired, start_date, contractual_completion,
forecast_completion, responsible_user_id -> users NULLABLE`` — and §3's rules
table states the constraint that is specific to it: **a project code is unique
among live projects**, which is why the unique index below is *partial*. The
group's second table, ``cost_centres`` (D010), is what ``assignments`` will
charge to (D040) and what ``transfer_requests`` will name (D047); its own
docstring carries the detail, and the one choice that belongs to the module is
that it sits here rather than in a module of its own — §1's boundary puts the
projects, their memberships and their cost centres behind one owner, and a
cost centre is meaningless without the project it belongs to or the reference
the Head Office row is the exception to.

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

# The two kinds of cost centre, in the map's own tokens (DOMAIN_ARCHITECTURE §2
# draws the row as ``kind HEAD_OFFICE|PROJECT``). Uppercase for the reason
# ``department.classification`` is — this is a closed classification the product
# owns, not a business code an operator writes — and the CHECK below is built
# from the tuple, so the pair cannot drift.
COST_CENTRE_KINDS = ("HEAD_OFFICE", "PROJECT")
HEAD_OFFICE_KIND = "HEAD_OFFICE"
PROJECT_KIND = "PROJECT"
MAX_KIND_LENGTH = 16

# Kind and reference are one fact, not two, and this is the SQL that says so: a
# Head Office cost centre names no project, a project cost centre names exactly
# one. Without it the row ``(PROJECT, NULL)`` — a project cost centre belonging
# to no project — is writable, and it is meaningless: it is the value the two
# partial indexes below would then agree to store twice.
COST_CENTRE_REFERENCE_MATCHES_KIND = (
    f"(kind = '{HEAD_OFFICE_KIND}' AND project_id IS NULL)"
    f" OR (kind = '{PROJECT_KIND}' AND project_id IS NOT NULL)"
)


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


class CostCentre(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """What a cost is charged to: the Head Office row, or one project's row.

    ``assignments`` will point at one of these (D040) and ``transfer_requests``
    will name two (D047), so the shape is settled here and the consumers are
    later tasks' business. Four choices worth stating, because each one is a
    rule a later task depends on:

    - **One table with a kind, not two.** §2 draws a single row, and the reason
      is that the two kinds are the same question — "where does this cost land?"
      — with two answers, and every consumer wants to name either one without a
      union. The variation between them is one nullable column, which is
      exactly what a kind column is for.
    - **"Exactly one HEAD_OFFICE row" is a unique index, not a CHECK.** The map
      states the rule; a CHECK cannot count rows, so the only database-level
      spelling of it is ``UNIQUE (kind) WHERE kind = 'HEAD_OFFICE'``. The
      predicate is the rule, as it is for a project code (D007). Two Head Office
      rows would be two answers to a question the product says has one, and a
      service-side guard would be a second implementation of a rule the database
      can hold.
    - **``project_id`` is unique only for the project kind** — one cost centre
      per project — so ``ix_cost_centres_project_id`` is partial too. A plain
      unique index would refuse to store the many Head Office rows that are
      ``NULL``… except it would not, because Postgres treats ``NULL``s as
      distinct, and that accident is not the reason to write it: the predicate
      says which rows the rule is about, and it keeps saying so if the column
      ever becomes non-null.
    - **No ``code``, no currency, and no legal entity.** §2 gives this table
      three columns and this is those three. A project's cost centre is
      identified by its project and the Head Office one by being the single row
      of its kind, so a code would be a second identity for something that
      already has one. Currency and legal entity are the two things the map's
      own sentence rules out by name ("no invented legal entities or
      currencies"): the product has one currency and one legal entity, and
      inventing a table for them would invent the multi-entity product this one
      is not (PRODUCT_SPEC §3).

    **``ON DELETE RESTRICT``, and a consequence.** This is the first table that
    references ``projects``, so deleting a project now has a database-level
    reason to be refused — which is the arm D008 documented as unreachable. It
    stays unreachable *through the API* until something creates a project's cost
    centre, and nothing does yet (the creation path is a later task's; see
    ``NEXT_PROMPT.md``), so the sentence in that task's record is still true and
    this table is the reason it will stop being true rather than a correction
    to make now.

    **No active flag.** A project cost centre retires with its project's status
    — there is nothing separate to deactivate — and the Head Office row is never
    retired. An ``is_active`` here would be a state with no transition on one
    kind and no meaning on the other.

    **No rows ship from the migration.** The Head Office row is the seed's
    (``app/seed.py``), because it is reference data the product names rather
    than structure: an operator with a migrated database and no seed has no Head
    Office cost centre, and that is a seed that has not been run, not a schema
    that is wrong.

    **Deliberately not enforced: "every project has exactly one".** The map
    states the pair of rules together, and D010 holds only the half a schema
    can: at most one per project. The other half — at least one — needs a
    writer, and the writer is the project creation route (D008), which this
    task does not touch.
    """

    __tablename__ = "cost_centres"
    __table_args__ = (
        # "Exactly one Head Office row": a CHECK cannot count rows, so the rule
        # is a unique index whose predicate names the single kind it constrains.
        Index(
            None,
            "kind",
            unique=True,
            postgresql_where=text(f"kind = '{HEAD_OFFICE_KIND}'"),
        ),
        # One cost centre per project. Partial for the reason the class
        # docstring gives: the predicate states which rows the rule is about.
        Index(
            None,
            "project_id",
            unique=True,
            postgresql_where=text(f"kind = '{PROJECT_KIND}'"),
        ),
        CheckConstraint("length(trim(name)) > 0", name="name_is_present"),
        CheckConstraint(
            "kind IN (" + ", ".join(f"'{kind}'" for kind in COST_CENTRE_KINDS) + ")",
            name="kind_is_known",
        ),
        # One fact, stated once: see the module-level constant.
        CheckConstraint(
            COST_CENTRE_REFERENCE_MATCHES_KIND,
            name="project_reference_matches_kind",
        ),
    )

    kind: Mapped[str] = mapped_column(String(MAX_KIND_LENGTH), nullable=False)
    name: Mapped[str] = mapped_column(String(MAX_NAME_LENGTH), nullable=False)
    # NULL for the Head Office row, set for a project's — and the CHECK above
    # makes that correspondence a constraint rather than a convention. RESTRICT
    # not CASCADE: a project with a cost centre cannot be deleted out from under
    # the assignments that will point at it (DOMAIN_ARCHITECTURE §2).
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"),
        nullable=True,
    )

    def __repr__(self) -> str:
        """Identity only — the F024 rule, as on ``Project``. No ``code`` to
        name, so the kind and the reference it carries are the identity."""
        return f"CostCentre(id={self.id!r}, kind={self.kind!r})"
