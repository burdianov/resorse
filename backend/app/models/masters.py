"""The reference tables the rest of the domain is built from (D002; DOMAIN_ARCHITECTURE §2).

The first Stage B table group, and the root of the map: modules hang off these
rows, and none of them reads another module. ``docs/DOMAIN_ARCHITECTURE.md`` §2
names the group and the sibling tables D003–D013 add to it; the recipe is
``docs/ADDING_A_MODULE.md``.

Two tables so far. ``disciplines`` (D002) is the controlled list a person, a
plan row and a report are all classified by. ``departments`` (D003) is the
Head Office / Site split those rows are organised under. Both are deliberately
plain: a **code**, a **name** and an **active flag**, plus the one attribute
the specification gives each — nothing else. No hierarchy, no category, no
sort order — every one of those is a shape that is cheap to add when something
needs it and expensive to remove once rows depend on it.

Three choices worth stating because they are load-bearing later:

- **``code`` is the identity; ``name`` is the label.** Callers store and join
  on the code, so the name is free to be corrected — "General" becoming
  "General Works" is an edit to a display string, not a migration of every row
  that points here. The unique index on ``code`` (not a service check) is what
  makes that identity real: two requests that race to create the same code
  cannot both win, and the failure is a database error naming the index rather
  than a duplicate that quietly exists. DOMAIN_ARCHITECTURE §3 states the rule
  for every business code in the map.
- **``is_active`` rather than delete.** The rows are referenced by history, so
  a value that stops being offered is deactivated and stays readable. What
  that leaves is a row that is *present and not offered*, which is why the
  flag is a column here rather than a status the owning module invents.
- **A classification is a closed vocabulary, not free text** (D003). A
  department is the head office or a site, and the specifications name both
  values, so the column is a short uppercase code checked against the two —
  the same shape ``sessions.revoked_reason`` uses. A third classification is a
  decision and a migration, which is the honest price of a column that stays
  groupable.

The CHECK constraints are the floor under the service (the F024 pattern): a
code is a lowercase slug — the same vocabulary ``permissions.code``,
preference keys and file categories already use, so nothing in this tree
spells a machine key in mixed case — a name is present, and a classification
is one of the two the product has. Those are what the database enforces
whatever writes next, including a psql session.
"""

from sqlalchemy import Boolean, CheckConstraint, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin

# One lowercase slug: a letter, then letters, digits and underscores. Narrower
# than the identity module's `resource.action` pattern on purpose — this is a
# single word, and `permissions.code`'s dot is not available to it.
CODE_PATTERN = r"^[a-z][a-z0-9_]*$"

MAX_CODE_LENGTH = 32
MAX_NAME_LENGTH = 200

# The closed vocabulary of ``department.classification`` (PRODUCT_SPEC §3,
# DOMAIN_ARCHITECTURE §2). Uppercase, unlike every other machine key in this
# tree, because these are the specification's own tokens — the same shape
# ``sessions.revoked_reason`` has, and the reason the CHECK is written from
# this tuple rather than typed twice. The schema layer (D005) mirrors it.
DEPARTMENT_CLASSIFICATIONS = (
    "HEAD_OFFICE",
    "SITE",
)
MAX_CLASSIFICATION_LENGTH = 16


class Discipline(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "disciplines"
    __table_args__ = (
        # The naming convention (F023) is what turns this into
        # `ix_disciplines_code`, which is the index the unique violation names.
        Index(None, "code", unique=True),
        CheckConstraint("code ~ '" + CODE_PATTERN + "'", name="code_is_well_formed"),
        CheckConstraint("length(trim(name)) > 0", name="name_is_present"),
    )

    code: Mapped[str] = mapped_column(String(MAX_CODE_LENGTH), nullable=False)
    name: Mapped[str] = mapped_column(String(MAX_NAME_LENGTH), nullable=False)
    # Deactivation, not deletion: seven rows (D002) ship active, and a value
    # that stops being offered is flipped rather than removed.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    def __repr__(self) -> str:
        """Identity only — the F024 rule (a stray ``print`` must not put more
        in a log than a row's key)."""
        return f"Discipline(id={self.id!r}, code={self.code!r})"


class Department(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Where a person or a plan row sits: the head office, or a site.

    The second reference table, and the one that carries a classification
    rather than an active flag alone. It is a code, a name, that
    classification and the flag — no parent, no site address, no ordering.
    D004 hangs designations off these rows by foreign key; what a row *is* has
    to be settled before anything points at one.

    **No rows ship here.** Unlike the seven disciplines, the specification
    names no initial departments (``PRODUCT_SPEC`` §3 describes the columns
    and stops), so the table is created empty and an operator defines their
    own. The head office's cost centre is a separate row group's business
    (D010) and is not this table's to invent.
    """

    __tablename__ = "departments"
    __table_args__ = (
        Index(None, "code", unique=True),
        CheckConstraint("code ~ '" + CODE_PATTERN + "'", name="code_is_well_formed"),
        CheckConstraint("length(trim(name)) > 0", name="name_is_present"),
        CheckConstraint(
            "classification IN ("
            + ", ".join(f"'{classification}'" for classification in DEPARTMENT_CLASSIFICATIONS)
            + ")",
            name="classification_is_known",
        ),
    )

    code: Mapped[str] = mapped_column(String(MAX_CODE_LENGTH), nullable=False)
    name: Mapped[str] = mapped_column(String(MAX_NAME_LENGTH), nullable=False)
    # Required, and one of the two the product has: a department that is
    # neither the head office nor a site is not a state this table represents.
    classification: Mapped[str] = mapped_column(String(MAX_CLASSIFICATION_LENGTH), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    def __repr__(self) -> str:
        """Identity only — the F024 rule."""
        return f"Department(id={self.id!r}, code={self.code!r})"
