"""The idempotent role and permission seed (F027; BP-6.3b, BP-8.2i).

``seed()`` is a function first and a CLI second (``python -m app.seed``), so
the bootstrap CLI can call it inside its own transaction — the super-admin
account it creates needs the ``super_admin`` role to exist, and "seed, then
grant" must be one atomic act, not two commands an operator can interleave.

Idempotency has an exact meaning here, and it is narrower than "upsert
everything":

- **Create what is missing, by natural key** (``permissions.code``,
  ``roles.name``). Rows that exist are *not* updated — F037's dictionary and
  F036's matrix let operators edit descriptions and (non-system) role grants,
  and a re-run after a deploy must not silently undo their work.
- **``super_admin`` is the exception, because it is the invariant**: it holds
  every registered permission code, and its grant set is re-asserted on every
  run. That is what makes new codes (F037 lets operators register more)
  flow to the protected role automatically, and it is safe precisely because
  F035 keeps the super-admin matrix column read-only (BP-7.4a) — there are no
  legitimate edits for the seed to trample. ``is_system=True`` on this role is
  both the marker F035 enforces and what this module restores if it is ever
  flipped.
- **The seed never creates or modifies users.** Accounts are the bootstrap
  CLI's (one-time) or F033's (admin UI) business. A seed that provisioned
  accounts would be a credentials-by-deployment backdoor — the thing BP-6.1b
  exists to prevent.
- **Non-system roles are never touched once created.** Editing ``admin`` or
  ``viewer`` is a supported operation (F036); re-seeding is not an undo.
- **The rows the product cannot start without are created the same way**
  (D002): the seven disciplines the specification names ship from this module,
  created if their ``code`` is missing and never updated — so an operator's
  rename or deactivation survives every re-run. This is not demo data (the
  distinction ``REFERENCE_PARITY.md`` draws): nothing is invented for a
  screenshot, and a database that has run the migrations but not this seed is
  one the product cannot classify anything in. **D010 adds the Head Office cost
  centre** to that group, by the same rule and for the same reason: the map
  says there is exactly one, the table makes that uniqueness a constraint
  (``0016``), and a database without the row has nowhere for a cost to land.

The three seeded roles (C16): ``super_admin`` holds everything;
``admin`` holds everything except ``roles.manage``/``permissions.manage`` —
running the user directory and settings is day-to-day administration, while
editing the authority dictionaries is privilege escalation and stays with the
protected role (BP-6.3e); ``viewer`` holds an **explicit read set** — the
``.read`` codes, the self-service notification pair, and ``reports.generate``
(producing an authorized PDF mutates nothing) — never the reference source's
"block if the only role is viewer" shortcut.

The caller owns the transaction: ``seed()`` flushes what it writes and commits
nothing. The CLI below commits once, then prints the report.
"""

import argparse
import asyncio
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import dispose_engine, get_sessionmaker
from app.core.permissions import (
    ALL_PERMISSION_CODES,
    PERMISSION_DESCRIPTIONS,
    PermissionCode,
)
from app.models import CostCentre, Discipline, Permission, Role
from app.models.identity import role_permissions
from app.models.projects import HEAD_OFFICE_KIND

SUPER_ADMIN_ROLE_NAME = "super_admin"
ADMIN_ROLE_NAME = "admin"
VIEWER_ROLE_NAME = "viewer"

# `admin` is defined as a subtraction so a new permission code cannot
# accidentally land on it (or miss it) — the exclusion list is the decision.
_ADMIN_WITHHELD_CODES = frozenset({PermissionCode.ROLES_MANAGE, PermissionCode.PERMISSIONS_MANAGE})

ADMIN_GRANTS = tuple(code for code in ALL_PERMISSION_CODES if code not in _ADMIN_WITHHELD_CODES)

# Read-only means read-only: every `.read` code, plus the two self-service
# actions every account must be able to perform on its *own* data
# (notifications) and the artifact-producing `reports.generate`.
#
# The tuple is written out rather than derived — `tests/test_seed.py` spells
# the same set literally so a change here fails a test and gets a decision —
# but its first clause is a rule, so the codes D005 registers are added with
# them: the master-data lists are the vocabulary every other registry is read
# against, which is exactly the oversight this role exists for. `admin` needs
# no edit: its set is defined by subtraction from `ALL_PERMISSION_CODES`.
VIEWER_GRANTS = (
    PermissionCode.USERS_READ,
    PermissionCode.ROLES_READ,
    PermissionCode.PERMISSIONS_READ,
    PermissionCode.SETTINGS_READ,
    PermissionCode.AUDIT_READ,
    PermissionCode.NOTIFICATIONS_READ,
    PermissionCode.NOTIFICATIONS_MANAGE_OWN,
    PermissionCode.FILES_READ,
    PermissionCode.REPORTS_GENERATE,
    PermissionCode.DISCIPLINES_READ,
    PermissionCode.DEPARTMENTS_READ,
    PermissionCode.DESIGNATIONS_READ,
    # The first *domain* read (D008). Read-only, like every other viewer grant:
    # a viewer sees the project list and a project's details and cannot create
    # or edit one — `projects.create` and `projects.update` are the two codes
    # this tuple deliberately leaves out.
    PermissionCode.PROJECTS_READ,
)


@dataclass(frozen=True)
class RoleSpec:
    """One seeded role. ``grants`` is the set written at *creation*;
    ``reassign_grants`` marks the protected role whose set is re-asserted to
    every registered code on every run (see the module docstring)."""

    name: str
    description: str
    is_system: bool
    grants: tuple[PermissionCode, ...]
    reassign_grants: bool = False


DEFAULT_ROLES = (
    RoleSpec(
        name=SUPER_ADMIN_ROLE_NAME,
        description=(
            "Full authority over the platform. Protected: its permission set "
            "is owned by the seed and is always every registered code."
        ),
        is_system=True,
        grants=ALL_PERMISSION_CODES,
        reassign_grants=True,
    ),
    RoleSpec(
        name=ADMIN_ROLE_NAME,
        description=(
            "Day-to-day administration: users, settings and read access to "
            "the authority dictionaries."
        ),
        is_system=False,
        grants=ADMIN_GRANTS,
    ),
    RoleSpec(
        name=VIEWER_ROLE_NAME,
        description=(
            "Read-only oversight: views authorized registries, reports and "
            "audit; changes nothing outside their own notifications."
        ),
        is_system=False,
        grants=VIEWER_GRANTS,
    ),
)

# The initial reference rows (D002; PRODUCT_SPEC §3 names all seven). Written
# as a table of ``(code, name)`` pairs because that is what it is: the code is
# the stable key — what every later row and query stores — and the name is the
# label an operator may correct. `PRODUCT_SPEC` fixes the names; the codes are
# the lowercase form DOMAIN_ARCHITECTURE's business-code rule takes, and a
# test spells both out so changing either is a deliberate act.
DEFAULT_DISCIPLINES: tuple[tuple[str, str], ...] = (
    ("electrical", "Electrical"),
    ("mechanical", "Mechanical"),
    ("plumbing", "Plumbing"),
    ("csi", "CSI"),
    ("mep", "MEP"),
    ("elv", "ELV"),
    ("general", "General"),
)

# The one cost centre the product names (D010; DOMAIN_ARCHITECTURE §2: "exactly
# one HEAD_OFFICE row"). Created-if-missing by **kind**, not by name, because
# the kind is what the table makes unique (``0016``): an operator who renames
# theirs keeps it, and a second Head Office row is refused by the database
# rather than merely not created here.
HEAD_OFFICE_COST_CENTRE_NAME = "Head Office"


@dataclass(frozen=True)
class SeedReport:
    """What one ``seed()`` call changed — zeros on a re-run over a seeded
    database, which is the idempotency the tests pin."""

    permissions_created: int
    roles_created: int
    grants_added: int
    grants_removed: int
    system_flags_restored: int
    disciplines_created: int
    cost_centres_created: int

    @property
    def is_noop(self) -> bool:
        return (
            self.permissions_created == 0
            and self.roles_created == 0
            and self.grants_added == 0
            and self.grants_removed == 0
            and self.system_flags_restored == 0
            and self.disciplines_created == 0
            and self.cost_centres_created == 0
        )

    def summary_lines(self) -> list[str]:
        """The operator-facing report, one line per fact touched."""
        if self.is_noop:
            return [
                (
                    "Seed: nothing to do — roles, permissions, reference rows and the "
                    "Head Office cost centre are up to date."
                )
            ]
        lines = [
            "Seed applied:",
            f"  permissions created: {self.permissions_created}",
            f"  roles created:       {self.roles_created}",
            f"  grants added:        {self.grants_added} (removed: {self.grants_removed})",
            f"  disciplines created: {self.disciplines_created}",
            f"  cost centres created: {self.cost_centres_created}",
        ]
        if self.system_flags_restored:
            lines.append(f"  is_system flags restored: {self.system_flags_restored}")
        return lines


async def seed(session: AsyncSession) -> SeedReport:
    """Bring the seeded catalogs up to date — roles, permissions and the
    initial reference rows. Caller commits."""
    existing_codes = set((await session.scalars(select(Permission.code))).all())
    created_permissions = 0
    for code in ALL_PERMISSION_CODES:
        if code.value not in existing_codes:
            session.add(Permission(code=code.value, description=PERMISSION_DESCRIPTIONS[code]))
            created_permissions += 1
    await session.flush()

    permission_ids = {
        permission.code: permission.id
        for permission in (await session.scalars(select(Permission))).all()
    }

    created_roles = 0
    grants_added = 0
    grants_removed = 0
    system_flags_restored = 0

    for spec in DEFAULT_ROLES:
        role = await session.scalar(select(Role).where(Role.name == spec.name))
        if role is None:
            role = Role(name=spec.name, description=spec.description, is_system=spec.is_system)
            session.add(role)
            await session.flush()
            created_roles += 1
            initial_ids = _granted_ids(spec, permission_ids)
            if initial_ids:
                await session.execute(
                    insert(role_permissions),
                    [{"role_id": role.id, "permission_id": pid} for pid in initial_ids],
                )
                grants_added += len(initial_ids)
            continue

        if not spec.reassign_grants:
            # Existing, operator-editable role: the seed defers to the matrix.
            continue

        if not role.is_system:
            role.is_system = True
            system_flags_restored += 1

        current = set(
            (
                await session.scalars(
                    select(role_permissions.c.permission_id).where(
                        role_permissions.c.role_id == role.id
                    )
                )
            ).all()
        )
        wanted = set(permission_ids.values())
        to_add = wanted - current
        to_remove = current - wanted
        if to_add:
            await session.execute(
                insert(role_permissions),
                [{"role_id": role.id, "permission_id": pid} for pid in to_add],
            )
            grants_added += len(to_add)
        if to_remove:
            await session.execute(
                delete(role_permissions).where(
                    role_permissions.c.role_id == role.id,
                    role_permissions.c.permission_id.in_(to_remove),
                )
            )
            grants_removed += len(to_remove)

    # The reference rows (D002). Create-if-missing by the natural key and
    # nothing else: a row that exists keeps whatever the operator made it,
    # including its name and its active flag.
    existing_discipline_codes = set((await session.scalars(select(Discipline.code))).all())
    disciplines_created = 0
    for discipline_code, discipline_name in DEFAULT_DISCIPLINES:
        if discipline_code not in existing_discipline_codes:
            session.add(Discipline(code=discipline_code, name=discipline_name))
            disciplines_created += 1
    await session.flush()

    # The Head Office cost centre (D010), by the same rule as the disciplines
    # above and nothing more. The lookup is by *kind* because the kind is what
    # the table makes unique — the name is an operator's to correct, and a row
    # that exists keeps whatever they made it.
    head_office_cost_centre = await session.scalar(
        select(CostCentre.id).where(CostCentre.kind == HEAD_OFFICE_KIND)
    )
    cost_centres_created = 0
    if head_office_cost_centre is None:
        session.add(CostCentre(kind=HEAD_OFFICE_KIND, name=HEAD_OFFICE_COST_CENTRE_NAME))
        cost_centres_created = 1
    await session.flush()

    return SeedReport(
        permissions_created=created_permissions,
        roles_created=created_roles,
        grants_added=grants_added,
        grants_removed=grants_removed,
        system_flags_restored=system_flags_restored,
        disciplines_created=disciplines_created,
        cost_centres_created=cost_centres_created,
    )


def _granted_ids(spec: RoleSpec, permission_ids: dict[str, uuid.UUID]) -> list[uuid.UUID]:
    """The permission ids to write when ``spec``'s role is first created.

    The protected role takes every code currently registered (so an operator
    who ran the seed once, then registered codes in F037, then recreated the
    role by hand, still gets a complete super-admin).
    """
    if spec.reassign_grants:
        return list(permission_ids.values())
    return [permission_ids[code.value] for code in spec.grants]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.seed",
        description=(
            "Create the default roles, every permission code, the initial "
            "reference rows and the Head Office cost centre if they are "
            "missing. Idempotent: existing rows are never modified. Safe to run "
            "at any time; the bootstrap CLI runs it for you."
        ),
    )
    parser.parse_args(argv)
    return asyncio.run(_run())


async def _run() -> int:
    try:
        async with get_sessionmaker()() as session:
            report = await seed(session)
            await session.commit()
        for line in report.summary_lines():
            print(line)
        return 0
    finally:
        await dispose_engine()


if __name__ == "__main__":
    raise SystemExit(main())
