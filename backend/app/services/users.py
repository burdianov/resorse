"""Admin user management: the directory's rules (F033).

The endpoints (``app/api/v1/admin_users.py``) stay thin; every rule that
decides *who may do what to whom* lives here, because those rules are the
security surface of this task (BP-6.1c, BP-6.3) — not the HTTP plumbing.

The rules, in one place:

- **Supers are managed by supers.** A caller who is not ``is_superuser`` can
  neither touch a superuser's account (update, deactivate, delete, reset) nor
  create one. The flag is F033/F035's *business data* (C20) — this module is
  where it starts being enforced.
- **No escalation by grants.** A non-superuser may only assign roles whose
  permissions are a **subset of their own effective set**; the seeded
  catalogue makes this exact rather than approximate — the ``admin`` role can
  grant ``admin`` (they hold every code it has), but only a superuser can
  grant ``super_admin``. A superuser's effective set is every code (C20), so
  the same rule lets them grant anything.
- **Nobody edits their own authority.** Changing *own* roles, active flag or
  superuser flag through the admin API is refused: self-demotion is the
  quietest escalation-adjacent mistake there is (§6.3). Own *profile* fields
  (name, email, phone) remain editable — and are F042's proper home later.
- **The last super-admin is protected.** Deactivating or deleting the only
  active superuser is a 409, whoever asks — including that superuser
  themselves (§6.1: "disallow last-super-admin removal/deactivation").
- **Deactivation and deletion end sessions, in the same commit** (BP-6.1):
  via F030's ``revoke_user_sessions`` with reason ``admin``. Deletion is the
  soft kind — ``is_deleted`` is set, the row stays for audit (F024), and the
  email stays occupied: an account is never silently reborn.
- **Listing filters in SQL** (BP-8.2): WHERE/LIMIT/OFFSET/COUNT against the
  database — never "fetch everything, filter in Python" — with a stable total
  order (the sort column plus ``id``) so offset pagination cannot show the
  same row twice across pages.

What deliberately does **not** live here yet: audit events (F043 owns the
store; F033's handoff records the gap) and who-may-reset-whom *policy
beyond the superuser rule* (the endpoint's permission check is the guard).
"""

import uuid
from collections.abc import Iterable
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import PermissionCode, effective_permissions
from app.core.security import generate_password, hash_password, password_policy_violations
from app.models.identity import Role, User
from app.services.passwords import PasswordPolicyViolation, reset_password
from app.services.sessions import revoke_user_sessions

# The sort allowlist: the frontend may order by these, nothing else.
SORTABLE_FIELDS = {
    "full_name": User.full_name,
    "email": User.email,
    "created_at": User.created_at,
    "last_login_at": User.last_login_at,
}


class UserNotFound(Exception):
    """No such user — or the soft-deleted one that is no longer manageable."""


class EmailAlreadyInUse(Exception):
    """The normalized address already belongs to an account (deleted ones
    included: the unique index keeps the grave closed)."""


class UnknownRoles(Exception):
    """One or more role ids do not exist (BP-6.3: validate them, never
    silently drop)."""

    def __init__(self, role_ids: list[uuid.UUID]) -> None:
        super().__init__("One or more of the selected roles do not exist.")
        self.role_ids = role_ids


class MissingPermission(Exception):
    """The field being changed needs a code the router-level guard did not
    demand — the ``is_active`` toggle under a ``users.update`` grant."""

    def __init__(self, code: PermissionCode) -> None:
        super().__init__(f"Missing permission: {code}")
        self.code = code


class ProtectedSuperuser(Exception):
    """A non-superuser tried to manage a superuser account."""


class PrivilegeEscalation(Exception):
    """The role set includes permissions the caller does not hold."""


class SelfModification(Exception):
    """Own roles / active / superuser flags are not editable through here."""


class SelfDeletion(Exception):
    """You cannot soft-delete your own account (§7.3)."""


class LastSuperuser(Exception):
    """The change would leave the platform with no active super-admin."""


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    """The user behind ``user_id``, or :class:`UserNotFound`.

    Soft-deleted accounts answer "not found" too: they are out of the
    directory's world, and every management endpoint treats them the same as
    absent rather than half-alive.
    """
    user = await session.get(User, user_id)
    if user is None or user.is_deleted:
        raise UserNotFound
    return user


async def list_users(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    is_active: bool | None,
    sort: str,
    order: str,
) -> tuple[list[User], int]:
    """One page of the directory and the total the footer needs."""
    criteria: list[Any] = [User.is_deleted.is_(False)]
    if search:
        pattern = f"%{_escape_like(search.strip())}%"
        criteria.append(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    if is_active is not None:
        criteria.append(User.is_active.is_(is_active))

    total = await session.scalar(select(func.count()).select_from(User).where(*criteria))
    column = SORTABLE_FIELDS[sort]
    ordered = column.desc() if order == "desc" else column.asc()
    # `id` as the tiebreaker: offset pagination needs a *total* order, or two
    # pages can disagree about where a row belongs while a request is in flight.
    statement = (
        select(User)
        .where(*criteria)
        .order_by(ordered, User.id.asc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    users = list(await session.scalars(statement))
    return users, int(total or 0)


def _escape_like(value: str) -> str:
    """A search term is a *term*, not a pattern: ``%`` and ``_`` match
    themselves. (Postgres ``ILIKE`` defaults to a backslash escape.)"""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def create_user(
    session: AsyncSession,
    *,
    actor: User,
    email: str,
    full_name: str,
    phone: str | None,
    role_ids: list[uuid.UUID],
    is_superuser: bool,
    password: str | None,
) -> tuple[User, str | None]:
    """Create an account; returns it plus the generated password, if any.

    The new credential always starts as a *temporary* one: the account is
    created ``must_change_password=True`` (BP-6.1b), so whether the admin
    supplied the value or the server generated it, the recipient replaces it
    at first sign-in.
    """
    if is_superuser and not actor.is_superuser:
        raise ProtectedSuperuser
    roles = await _resolve_roles(session, role_ids)
    _ensure_roles_assignable(actor, roles)

    canonical = email.strip().lower()
    temporary: str | None = None
    if password is None:
        password = generate_password()
        temporary = password
    # C15's uniform path — every password passes the policy before hashing,
    # for both sources (a generator bug must be loud, not a weak account).
    violations = password_policy_violations(password, email=canonical)
    if violations:
        raise PasswordPolicyViolation(violations)

    user = User(
        email=canonical,
        full_name=full_name.strip(),
        phone=phone,
        hashed_password=hash_password(password),
        must_change_password=True,
        is_superuser=is_superuser,
        roles=roles,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as error:
        # The unique index is the authority (F024: check-then-insert loses the
        # race); the rollback clears the poisoned transaction before the 409.
        await session.rollback()
        raise EmailAlreadyInUse from error
    await session.commit()
    return user, temporary


async def update_user(
    session: AsyncSession,
    *,
    actor: User,
    target: User,
    changes: dict[str, Any],
) -> User:
    """Apply a partial edit. ``changes`` keys come from the request's
    ``model_fields_set`` — absent fields are not in the dict, and ``phone:
    null`` is (meaning *clear it*).

    ``role_ids``, when present, is the **complete** new role set: the edit
    dialog submits what the multiselect currently shows, so the server
    replaces rather than patches (no "add role X" race to lose).
    """
    _ensure_manageable(actor, target)

    if "role_ids" in changes:
        roles = await _resolve_roles(session, changes["role_ids"])
        _ensure_roles_assignable(actor, roles)
        if actor.id == target.id:
            raise SelfModification
        target.roles = list(roles)  # replace the set, atomically, on commit

    if "is_active" in changes and changes["is_active"] != target.is_active:
        if changes["is_active"] is False:
            # Deactivation is the direction that can orphan the platform and
            # strand sessions — and the platform's rule outranks the personal
            # one below (a last super-admin deactivating *themselves* hears
            # "last super-admin", not "no self-changes"). The check sits
            # after `_ensure_manageable`, so an unauthorized caller learns
            # nothing about super-admin counts.
            await _ensure_not_last_superuser(session, target)
        if actor.id == target.id:
            raise SelfModification
        if PermissionCode.USERS_DEACTIVATE not in effective_permissions(actor):
            # The router demanded `users.update`; flipping the lifecycle flag
            # is a deactivation and needs its own grant (least privilege, §6.3).
            raise MissingPermission(PermissionCode.USERS_DEACTIVATE)
        target.is_active = changes["is_active"]
        if changes["is_active"] is False:
            await revoke_user_sessions(session, target.id, reason="admin")

    if "email" in changes:
        target.email = str(changes["email"]).strip().lower()
    if "full_name" in changes:
        target.full_name = changes["full_name"].strip()
    if "phone" in changes:
        target.phone = changes["phone"]

    try:
        # The row update, the role replacement and any session revocation all
        # ride this one commit — deactivation cannot half-happen (F030's rule).
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise EmailAlreadyInUse from error
    # `updated_at` is a SQL-expression `onupdate`: the ORM marks it expired
    # after the flush, and the response builder's first read of it would be
    # lazy IO — a `MissingGreenlet` under asyncio (ARCHITECTURE §12). Refresh
    # re-loads the row (and its eager relationships) so the caller serialises
    # loaded state.
    await session.refresh(target)
    return target


async def delete_user(session: AsyncSession, *, actor: User, target: User) -> None:
    """Soft-delete: the row survives for audit, the account stops existing
    for everyone else (login refuses, the list hides it, the email stays
    taken), and every session ends in the same commit."""
    _ensure_manageable(actor, target)
    # Same ordering as the deactivation path: the platform's rule first (a
    # last super-admin deleting themselves hears 409, not "no self-deletion"),
    # then the personal prohibition.
    await _ensure_not_last_superuser(session, target)
    if actor.id == target.id:
        raise SelfDeletion
    target.is_deleted = True
    target.is_active = False
    await revoke_user_sessions(session, target.id, reason="admin")
    await session.commit()


async def reset_user_password(session: AsyncSession, *, actor: User, target: User) -> str:
    """Admin-initiated reset, with the guard rules; the mechanics (temporary
    credential, forced change, every session revoked as ``admin``) are F030's
    :func:`app.services.passwords.reset_password`."""
    _ensure_manageable(actor, target)
    return await reset_password(session, target)


def _ensure_manageable(actor: User, target: User) -> None:
    """A superuser's account is managed by superusers only — for *every*
    mutation, so the rule cannot be dodged by choosing a different verb."""
    if target.is_superuser and not actor.is_superuser:
        raise ProtectedSuperuser


async def _ensure_not_last_superuser(session: AsyncSession, target: User) -> None:
    """Refuse when deactivating/deleting ``target`` would leave zero active
    superusers. Only checked when it matters (the target is one)."""
    if not target.is_superuser or not target.is_active:
        return
    others = await session.scalar(
        select(func.count())
        .select_from(User)
        .where(
            User.is_superuser.is_(True),
            User.is_active.is_(True),
            User.is_deleted.is_(False),
            User.id != target.id,
        )
    )
    if int(others or 0) == 0:
        raise LastSuperuser


async def _resolve_roles(session: AsyncSession, role_ids: list[uuid.UUID]) -> list[Role]:
    """The roles behind the ids, or :class:`UnknownRoles` naming the missing
    ones (never silently dropped — BP-6.3's "validate unknown ids")."""
    if not role_ids:
        return []
    unique = list(dict.fromkeys(role_ids))
    roles = list(await session.scalars(select(Role).where(Role.id.in_(unique))))
    if len(roles) != len(unique):
        found = {role.id for role in roles}
        raise UnknownRoles([role_id for role_id in unique if role_id not in found])
    return roles


def ensure_codes_assignable(actor: User, codes: Iterable[str]) -> None:
    """The subset rule: ``actor`` may grant only codes they hold.

    A superuser holds every code (C20), so the check passes everything for
    them. Lives here because F033 implemented it first; F035's matrix save
    imports it — the escalation guard is one rule with one spelling, not one
    per surface (C22's note made this explicit).
    """
    if actor.is_superuser:
        return
    held = effective_permissions(actor)
    for code in codes:
        if code not in held:
            raise PrivilegeEscalation


def _ensure_roles_assignable(actor: User, roles: list[Role]) -> None:
    """The subset rule, applied to whole roles (F033's call site)."""
    ensure_codes_assignable(
        actor, (permission.code for role in roles for permission in role.permissions)
    )
