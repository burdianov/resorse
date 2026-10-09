"""Permission dictionary: the guardrails (F037).

`app/api/v1/admin_permissions.py` stays thin; the rules live here (C26):

- **A code in use is frozen in spelling.** Grants in `role_permissions` mean
  "the code as it reads"; renaming under live grants would silently rewrite
  what every holder authorises, and deleting would silently strip authority.
  Both are refused with a 409 carrying the assignment count — the symmetric
  form of F035's "deletion refused while assigned". Descriptions carry no
  authority and edit freely. An *unused* code can be renamed (typo fixed
  before first grant) or deleted.
- **Codes do not collide, silently or otherwise.** The unique index is the
  authority (F024's pattern, F035's shape): a duplicate insert/update rolls
  back and answers 409. The shape itself — lowercase `resource.action`, the
  model's own pattern imported, never re-stated — is validated at the schema,
  and deliberately **not** normalised: a code is a machine-stable identifier,
  and quietly lowercase-ing `Users.Read` would make two spellings mean the
  same authority.
- **No subset rule here, on purpose.** F033/F035's escalation guard exists
  because grants confer capability; *creating* a code confers nothing — it
  becomes grantable only through the matrix save, which already enforces
  "grant only what you hold" (C22/C24). Requiring a dictionary editor to hold
  a code that does not exist yet would be a rule that cannot be satisfied.
  The seeded codes protect themselves: `super_admin` holds every one (C16),
  so every seeded code is in use and therefore rename/delete-frozen.
- **The seed stays idempotent** across operator-defined codes: it creates
  what is missing and never modifies existing rows (C16), so F037's additions
  survive every seed run.

Audit events remain F043's (the same recorded gap as C22/C24).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.identity import Permission, User, role_permissions
from app.services import audit


class PermissionNotFound(Exception):
    """No such permission row."""


class PermissionCodeTaken(Exception):
    """Another row already carries this code (the unique index's verdict)."""


class PermissionInUse(Exception):
    """The code is granted to roles and cannot be renamed or deleted while
    it is — both operations would silently change what those grants mean."""

    def __init__(self, assignments: int) -> None:
        super().__init__("This permission is granted to roles.")
        self.assignments = assignments


async def list_permissions(session: AsyncSession) -> list[Permission]:
    """Every code, sorted — the dictionary's one order, shared by the matrix
    and the management table."""
    return list(await session.scalars(select(Permission).order_by(Permission.code.asc())))


async def get_permission(session: AsyncSession, permission_id: uuid.UUID) -> Permission:
    """The row, **re-read with its collections loaded**.

    `populate_existing` for the F035 reason (ARCHITECTURE §12): `session.delete`
    needs the `roles` collection to compute the secondary-table diff, and an
    identity-map hit can hand back an instance whose collection was never
    loaded — the load then happens inside the delete, which under asyncio is a
    `MissingGreenlet`.
    """
    permission = await session.scalar(
        select(Permission)
        .where(Permission.id == permission_id)
        # Explicit `selectinload`: `Permission.roles` has no `selectin`
        # default (unlike `Role.permissions`), so `populate_existing` alone
        # would re-apply *lazy* — and the load would happen inside the
        # caller's delete instead of here.
        .options(selectinload(Permission.roles))
        .execution_options(populate_existing=True)
    )
    if permission is None:
        raise PermissionNotFound
    return permission


async def create_permission(
    session: AsyncSession, *, actor: User, code: str, description: str | None
) -> Permission:
    permission = Permission(code=code, description=description)
    session.add(permission)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise PermissionCodeTaken from error
    await audit.record(
        session,
        actor=actor,
        action="permission.create",
        entity_type="permission",
        entity_id=permission.id,
        summary=f"Added permission {permission.code}.",
        details={"code": permission.code, "description": permission.description},
    )
    await session.commit()
    return permission


async def update_permission(
    session: AsyncSession,
    *,
    actor: User,
    target: Permission,
    changes: dict[str, str | None],
) -> Permission:
    """Rename (only while unused) and/or re-describe. One commit."""
    before: dict[str, object] = {"code": target.code, "description": target.description}
    if "code" in changes and changes["code"] is not None and changes["code"] != target.code:
        assignments = await _assignment_count(session, target.id)
        if assignments > 0:
            raise PermissionInUse(assignments)
        target.code = changes["code"]
    if "description" in changes:
        target.description = changes["description"]

    await audit.record(
        session,
        actor=actor,
        action="permission.update",
        entity_type="permission",
        entity_id=target.id,
        summary=f"Updated permission {target.code}.",
        details={
            "before": before,
            "after": {"code": target.code, "description": target.description},
        },
    )
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise PermissionCodeTaken from error
    # `updated_at` is IO after an UPDATE (ARCHITECTURE §12) — refresh before
    # anything serialises the row.
    await session.refresh(target)
    return target


async def delete_permission(session: AsyncSession, *, actor: User, target: Permission) -> None:
    assignments = await _assignment_count(session, target.id)
    if assignments > 0:
        raise PermissionInUse(assignments)
    await audit.record(
        session,
        actor=actor,
        action="permission.delete",
        entity_type="permission",
        entity_id=target.id,
        summary=f"Deleted permission {target.code}.",
        details={"code": target.code},
    )
    await session.delete(target)
    await session.commit()


async def _assignment_count(session: AsyncSession, permission_id: uuid.UUID) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(role_permissions)
        .where(role_permissions.c.permission_id == permission_id)
    )
    return int(count or 0)
