"""The reference tables the rest of the domain is built from (D002; DOMAIN_ARCHITECTURE §2).

The first Stage B table group, and the root of the map: modules hang off these
rows, and none of them reads another module. ``docs/DOMAIN_ARCHITECTURE.md`` §2
names the group and the sibling tables D003–D013 add to it; the recipe is
``docs/ADDING_A_MODULE.md``.

One table here so far, ``disciplines`` — the controlled list a person, a plan
row and a report are all classified by. It is deliberately plain: a **code**, a
**name** and an **active flag**, nothing else. No hierarchy, no category, no
sort order — every one of those is a shape that is cheap to add when something
needs it and expensive to remove once rows depend on it.

Two choices worth stating because they are load-bearing later:

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

The CHECK constraints are the floor under the service (the F024 pattern): a
code is a lowercase slug — the same vocabulary ``permissions.code``,
preference keys and file categories already use, so nothing in this tree
spells a machine key in mixed case — and a name is present. Both are what the
database enforces whatever writes next, including a psql session.
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
