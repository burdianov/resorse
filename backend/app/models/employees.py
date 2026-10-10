"""The people the work is staffed with (D011; DOMAIN_ARCHITECTURE §2).

The ``masters`` module's fourth table and the **first that is not a reference
row**. ``masters.py`` holds the three the product classifies everything else by
— a code, a name and a flag, and nothing else — while this one is a record with
a status, two dates and a link to a login account. The map keeps both in one
module (the boundary is §1's, and "who may be assigned" belongs with "what they
are classified as"), but the file is separate for the reason the module
docstrings have been claiming: one file's prose has to be true of every class
in it, and a record's docstring has nothing to say about reference lists.

Five choices, each one a rule a later task reads:

- **The name is one column, not two.** ``PRODUCT_SPEC`` §3 says it in three
  words — "Do not split name" — and this is that rule as a schema. A person's
  name is not reliably a first part and a last part: a patronymic chain, a
  compound surname and a name with no surname at all are all ordinary here, and
  a pair of columns is a guess about how names work that the product then has
  to defend in every form, import and report. Nothing between D012 and D091
  sorts, greets or groups by a name *part*, so there is no consumer to justify
  one. ``full_name`` holds the whole name an operator typed.
- **``employee_id`` is the identity, and it is business data.** Unique, because
  the map's rules table groups it with every other business code — and enforced
  by the index rather than a service check, so two racing creates cannot both
  win. But **no slug CHECK**: like a project code (D007), an employee id is what
  the organisation already prints on a badge or in its own records, the
  specification gives it no shape, and a pattern that rejected ``EMP-0042``
  would be a defect. Only presence is checked.
- **``status``, and deliberately no ``is_active``.** The reference tables carry
  a boolean flag; the map gives this table a ``status`` and the specification
  calls it "active/employment status" (``PRODUCT_SPEC`` §3), so the column is a
  closed two-value vocabulary — the same uppercase shape
  ``department.classification`` has, built into the CHECK from the tuple below.
  Adding a boolean beside it would be two spellings of one fact, which is what
  C70 refused for cost centres. The *event* of leaving, with its date and its
  close-the-assignments rule, is D059–D063's ``employee_events``; this column is
  the state, not the history.
- **Both dates are optional, and only ordered.** "Optional hire/end dates"
  (``PRODUCT_SPEC`` §3) — so both are nullable, and the one thing the database
  refuses is an end **before** a hire, which is a typo rather than a plan (the
  rule D007 applies to a project's completions). Nothing ties a date to the
  status: a row that is inactive with no end date is one an import or a
  correction can legitimately carry, and inventing a rule against it would
  refuse real data. Both nulls, or either one alone, are allowed.
- **The login link is a link, not an identity.** ``PRODUCT_SPEC`` §3:
  "Users and employees are distinct records, optionally linked for authorized
  user accounts; don't assume every employee can log in." So ``user_id`` is
  nullable and unique **where it is present** — one login per person and one
  person per login — and ``ON DELETE RESTRICT``, because the product
  soft-deletes users (C22) and blanking a link would erase a fact rather than
  record one.

**Deliberately absent: contact fields.** ``PRODUCT_SPEC`` §3 admits them "only
if justified", and nothing in the product reads one: notifications go to the
user account, and no screen or report lists a phone number *by employee*. A
column with no consumer is exactly the shape ``masters.py`` refuses, so it is a
migration when D013's forms need one.

**No rows ship.** The specification names no initial employees, so ``0017``
leaves the table empty and ``app/seed.py`` writes nothing here — the same split
``designations`` follows.

The CHECKs are the floor under the service (the F024 pattern), and they are what
the database enforces whatever writes next, including a ``psql`` session.
"""

import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin

# The same widths every other business code and name in the tree uses
# (DOMAIN_ARCHITECTURE §3 groups the codes under one rule), but no pattern:
# see the module docstring.
MAX_EMPLOYEE_ID_LENGTH = 32
MAX_NAME_LENGTH = 200

# The closed vocabulary of ``employee.status`` (PRODUCT_SPEC §3's "active /
# employment status"). Uppercase, like ``department.classification``, because
# this is a classification the product owns rather than a code an operator
# writes — and the CHECK below is built from the tuple, so the pair cannot
# drift. Two values: the state is "on the books" or "not", the transition is
# D012's ``employees.deactivate``, and what *happened* is an event (D059–D063).
EMPLOYEE_STATUSES = (
    "ACTIVE",
    "INACTIVE",
)
MAX_STATUS_LENGTH = 16


class Employee(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A person on the books: one name, one designation, one state.

    Four edges leave this row — the designation it holds, the login it may be
    linked to, and (D014–D017, D040) the rates and assignments that hang off
    it later — so the shape is settled here and the consumers are those tasks'
    business. Two of them are foreign keys and both restrict: a person's
    designation is history once it has been held, and the account link is a
    fact about an account rather than a pointer that may silently go blank.
    """

    __tablename__ = "employees"
    __table_args__ = (
        # The identity, and the map's rules table groups it with every other
        # business code: unique in the database, not in a service.
        Index(None, "employee_id", unique=True),
        # "Which people hold this designation?" is asked from the referenced
        # side, which the primary key cannot serve.
        Index(None, "designation_id"),
        # One login per person. Partial because the rule governs the rows that
        # *have* a login: Postgres treats `NULL`s as distinct, so a plain index
        # would also work today, but the predicate is what states the rule —
        # and it keeps stating it if the column ever becomes non-null (the
        # reason `ix_cost_centres_project_id` is partial, C70).
        Index(None, "user_id", unique=True, postgresql_where=text("user_id IS NOT NULL")),
        CheckConstraint("length(trim(employee_id)) > 0", name="employee_id_is_present"),
        CheckConstraint("length(trim(full_name)) > 0", name="full_name_is_present"),
        CheckConstraint(
            "status IN (" + ", ".join(f"'{status}'" for status in EMPLOYEE_STATUSES) + ")",
            name="status_is_known",
        ),
        # A NULL on either side makes this pass, which is what "optional" means;
        # what it refuses is a row claiming someone left before they arrived.
        CheckConstraint("end_date >= hire_date", name="end_date_is_not_before_hire_date"),
    )

    employee_id: Mapped[str] = mapped_column(String(MAX_EMPLOYEE_ID_LENGTH), nullable=False)
    # One column, whole name: PRODUCT_SPEC §3's "Do not split name", and the
    # reason this module exists at all (the docstring).
    full_name: Mapped[str] = mapped_column(String(MAX_NAME_LENGTH), nullable=False)
    # Required and restrictive, as a designation's two references are (D004): a
    # title a person still holds cannot be deleted out from under them.
    designation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("designations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Required, and one of the two: a person with no state is not a row this
    # table represents.
    status: Mapped[str] = mapped_column(String(MAX_STATUS_LENGTH), nullable=False)
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # NULL for most people — a login is the exception (PRODUCT_SPEC §3). The
    # index above makes the exception unique; RESTRICT because the product
    # soft-deletes users (C22) and this is a fact, not a dangling pointer.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    def __repr__(self) -> str:
        """Identity only — the F024 rule (a stray ``print`` must not put more
        in a log than a row's key)."""
        return f"Employee(id={self.id!r}, employee_id={self.employee_id!r})"
