"""Role management: the catalogue's rules (F035).

`app/api/v1/admin_roles.py` stays thin; the rules live here — who may edit a
role, what a grant set may contain, and what "atomic" means for the matrix.

- **`is_system` roles are the seed's.** `super_admin`'s row and its grant set
  are re-asserted on every seed run (C16); this module refuses to rename,
  re-describe, delete or re-grant it. The matrix save *accepts* an unchanged
  `is_system` entry — a UI sending every visible column should not have to
  special-case the protected one — and refuses any actual change to it.
- **The subset rule governs edits in both directions.** A non-superuser may
  touch only roles whose *current* grants are within their own effective set,
  and may save only sets within it: granting beyond yourself is escalation,
  and stripping a role of codes you do not hold is authority over a column
  you cannot see. A superuser's effective set is every code (C20), so the
  rule passes everything for them. The primitive is F033's
  (`app.services.users.ensure_codes_assignable`) — one rule, one spelling
  (C22).
- **Deletion is refused while the role is assigned** (BP-7.4: "safeguards if
  role assigned to users"). `user_roles` cascades on delete, and a cascade
  that silently strips authority is exactly the accident the safeguard
  prevents: the admin removes the role from its holders first.
- **The matrix save is atomic by construction** (BP-7.4's "one atomic server
  save, avoid sequential PATCH partial success"): every entry is validated —
  role exists, system rule, subset rule on old *and* new sets, codes exist —
  **before the first write**, and one commit covers all replacements. An
  invalid later entry cannot leave an earlier role half-saved; the tests
  prove it.
- **Effective permissions re-evaluate per request** (C20, BP-6.3f's chosen
  half), so a grant change applies on each holder's next request. Sessions
  are deliberately **not** revoked for role edits (C24 records why the §3
  table's "rotation on role change" is superseded): a role edit would log out
  everyone holding it, while the security property — no stale privilege —
  already holds without that.

Naming: like the user directory, the service decides and raises; the router
translates. Name collisions surface as 409; payload problems as 422 with a
dotted field path the form layer already understands.
"""

import uuid
from collections.abc import Iterable, Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import Permission, Role, User, role_permissions, user_roles
from app.services.users import ensure_codes_assignable


class RoleNotFound(Exception):
    """No such role. Also raised for a matrix entry naming one."""


class RoleNameInUse(Exception):
    """Another role already carries this name (unique index's verdict)."""


class RoleInUse(Exception):
    """The role is assigned to users and cannot be deleted while it is."""

    def __init__(self, user_count: int) -> None:
        super().__init__("This role is assigned to users and cannot be deleted.")
        self.user_count = user_count


class SystemRoleProtected(Exception):
    """An `is_system` role (the seed's) was about to be renamed, deleted, or
    have its grant set changed."""


class UnknownPermissionCodes(Exception):
    """Permission codes that do not exist in the dictionary (the create path's
    field-addressable refusal; the matrix path uses :class:`MatrixViolation`)."""

    def __init__(self, codes: Iterable[str]) -> None:
        joined = ", ".join(codes)
        super().__init__(f"Unknown permission codes: {joined}.")
        self.codes = list(codes)


class MatrixViolation(Exception):
    """One matrix entry is invalid — carrying *which* entry and field, so the
    refusal is addressable at `roles[<index>].<field>` instead of a sentence
    about the payload as a whole."""

    def __init__(self, *, index: int, field: str, message: str) -> None:
        super().__init__(message)
        self.index = index
        self.field = field
        self.message = message


async def list_roles(session: AsyncSession) -> list[Role]:
    """Every role, sorted by name; the eager `selectin` on `permissions`
    makes the serialisation a pure in-memory fold."""
    return list(await session.scalars(select(Role).order_by(Role.name.asc())))


async def get_role(session: AsyncSession, role_id: uuid.UUID) -> Role:
    """The role, **re-read with its grants loaded**.

    `populate_existing` matters twice over: the serialiser folds
    `role.permissions`, and an identity-map hit can hand back an instance whose
    collection is in any state (F033's lesson — read the database's truth, not
    the map's memory). ARCHITECTURE §12 records the family of traps.
    """
    role = await session.scalar(
        select(Role).where(Role.id == role_id).execution_options(populate_existing=True)
    )
    if role is None:
        raise RoleNotFound
    return role


async def create_role(
    session: AsyncSession,
    *,
    actor: User,
    name: str,
    description: str | None,
    permission_codes: list[str],
) -> Role:
    """Create a role with its initial grant set (one commit)."""
    permissions = await _resolve_permissions(session, permission_codes, index=None)
    ensure_codes_assignable(actor, (permission.code for permission in permissions))

    role = Role(
        name=name.strip(),
        description=_cleaned_description(description),
        permissions=permissions,
    )
    session.add(role)
    try:
        await session.flush()
    except IntegrityError as error:
        # The unique index is the authority (F024's pattern, F033's shape).
        await session.rollback()
        raise RoleNameInUse from error
    await session.commit()
    return role


async def update_role(
    session: AsyncSession,
    *,
    actor: User,
    target: Role,
    changes: dict[str, str | None],
) -> Role:
    """Rename/re-describe. Grants are the matrix save's business, never a
    side effect of a rename."""
    if target.is_system:
        raise SystemRoleProtected
    if "name" in changes and changes["name"] is not None:
        target.name = changes["name"].strip()
    if "description" in changes:
        target.description = _cleaned_description(changes["description"])

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise RoleNameInUse from error
    # Same reason as F033's update: `updated_at` is IO after an UPDATE
    # (ARCHITECTURE §12).
    await session.refresh(target)
    return target


async def delete_role(session: AsyncSession, *, actor: User, target: Role) -> None:
    """Delete an unassigned, non-system role; refuse otherwise."""
    if target.is_system:
        raise SystemRoleProtected
    assigned = await session.scalar(
        select(func.count()).select_from(user_roles).where(user_roles.c.role_id == target.id)
    )
    if int(assigned or 0) > 0:
        raise RoleInUse(int(assigned or 0))
    await session.delete(target)
    await session.commit()


async def save_matrix(
    session: AsyncSession,
    *,
    actor: User,
    entries: Sequence[tuple[uuid.UUID, list[str]]],
) -> None:
    """Replace the grant sets of the given roles — atomically.

    Phase one validates every entry and touches nothing; phase two applies
    all replacements; one commit ends it. Validation first is what makes the
    rollback tests true statements rather than hopes: by the time the first
    row changes, no entry can fail.
    """
    resolved: list[tuple[Role, list[Permission]]] = []
    for index, (role_id, codes) in enumerate(entries):
        # `get_role`, not `session.get`: the assignment below needs the *old*
        # collection loaded to compute the secondary-table diff, and an
        # identity-map hit can hand back an instance whose collection state is
        # anyone's guess (the trap ARCHITECTURE §12 records — assigning to an
        # unloaded collection lazy-loads, which under asyncio is a
        # MissingGreenlet).
        try:
            role = await get_role(session, role_id)
        except RoleNotFound:
            raise MatrixViolation(
                index=index, field="role_id", message="This role does not exist."
            ) from None
        permissions = await _resolve_permissions(session, codes, index=index)
        new_codes = sorted({permission.code for permission in permissions})

        current_codes = await _current_codes(session, role.id)
        if role.is_system:
            if new_codes != current_codes:
                # Unchanged is accepted (a full-matrix payload may include the
                # protected column); changed is not (C16).
                raise SystemRoleProtected
            continue

        ensure_codes_assignable(actor, new_codes)
        # The old set too: editing a column you cannot fully see is authority
        # over grants you do not hold — stripping counts as much as granting.
        # Read from SQL rather than the ORM collection: the collection's load
        # state is the identity map's business, the grant rows are the truth.
        ensure_codes_assignable(actor, current_codes)
        resolved.append((role, permissions))

    for role, permissions in resolved:
        role.permissions = list(permissions)
    # One commit for every replacement — there is no path here that writes
    # half the matrix.
    await session.commit()


async def _current_codes(session: AsyncSession, role_id: uuid.UUID) -> list[str]:
    """The role's grant codes, straight from the association table."""
    codes = await session.scalars(
        select(Permission.code)
        .select_from(Permission)
        .join(role_permissions, role_permissions.c.permission_id == Permission.id)
        .where(role_permissions.c.role_id == role_id)
    )
    return sorted(codes)


async def _resolve_permissions(
    session: AsyncSession, codes: list[str], *, index: int | None
) -> list[Permission]:
    """The permission rows behind the codes, deduplicated in submission order.

    Unknown codes are a field-addressable 422 (never silently dropped —
    §6.3's "validate unknown ids"); duplicates are deduplicated rather than
    refused, because "the same box ticked twice" is a UI artefact, not an
    intent.
    """
    unique = list(dict.fromkeys(codes))
    if not unique:
        return []
    rows = list(await session.scalars(select(Permission).where(Permission.code.in_(unique))))
    if len(rows) != len(unique):
        found = {row.code for row in rows}
        missing = [code for code in unique if code not in found]
        message = f"Unknown permission codes: {', '.join(missing)}."
        if index is None:
            raise UnknownPermissionCodes(missing)
        raise MatrixViolation(index=index, field="permission_codes", message=message)
    by_code = {row.code: row for row in rows}
    return [by_code[code] for code in unique]


def _cleaned_description(description: str | None) -> str | None:
    if description is None:
        return None
    cleaned = description.strip()
    return cleaned or None
