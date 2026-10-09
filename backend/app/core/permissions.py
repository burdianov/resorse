"""The permission vocabulary (F027).

ARCHITECTURE §6 fixes the codes this foundation ships with: namespaced
``resource.action``, machine-stable, registered server-side. This module is the
one place they are written down — the seed grants from it, F031's dependencies
will check against it, and F037's dictionary (which may add operator-defined
codes at runtime) edits *rows*, never this list.

A ``StrEnum``, so a member **is** the string PostgreSQL knows
(``PermissionCode.USERS_READ == "users.read"``): no ``.value`` at call sites,
no second constant to drift, and a typo in a ``require_permission`` call is an
``AttributeError`` at import rather than a 403 in production.

Deliberately named ``PermissionCode``: ``Permission`` is the ORM row in
``app/models/identity.py``, and the seed needs both in one function.

The three layers that consume this vocabulary split the read/write line the
same way the route registry does (F016: pages gate on ``.read``, mutations on
the managing code):

- ``.read`` codes open the corresponding admin page read-only;
- the managing code (``roles.manage``, ``users.create``, …) authorises the
  mutation. The seed's ``viewer`` role is exactly the read set — read-only by
  explicit grants, never by a "block if viewer" shortcut (BP-6.3b).
"""

from enum import StrEnum
from typing import Final

from app.models.identity import User


class PermissionCode(StrEnum):
    """Every permission code the foundation ships with (ARCHITECTURE §6)."""

    # The user directory (F033/F034).
    USERS_READ = "users.read"
    USERS_CREATE = "users.create"
    USERS_UPDATE = "users.update"
    USERS_DEACTIVATE = "users.deactivate"
    USERS_RESET_PASSWORD = "users.reset_password"

    # The authority dictionaries: roles and permissions (F035-F038). Managing
    # these is privilege escalation by definition, which is why the seeded
    # `admin` role deliberately does not hold the two `.manage` codes (C16).
    ROLES_READ = "roles.read"
    ROLES_MANAGE = "roles.manage"
    PERMISSIONS_READ = "permissions.read"
    PERMISSIONS_MANAGE = "permissions.manage"

    # Application settings (F039/F040).
    SETTINGS_READ = "settings.read"
    SETTINGS_MANAGE = "settings.manage"

    # Audit trail (F043/F044). There is no `audit.manage`: the log is
    # append-only, and mutation routes for it deliberately do not exist.
    AUDIT_READ = "audit.read"

    # Notifications (F045/F046). `manage_own` is scoped in SQL to the caller:
    # it is self-service, held by every seeded role.
    NOTIFICATIONS_READ = "notifications.read"
    NOTIFICATIONS_MANAGE_OWN = "notifications.manage_own"

    # Files (F049/F050) and reports (F051-F053).
    FILES_READ = "files.read"
    FILES_CREATE = "files.create"
    REPORTS_GENERATE = "reports.generate"


# Human text for the permission dictionary UI (F038) and the seed's rows.
# Every member must appear here — a test enforces it, because a code without a
# description is a row the dictionary renders blank.
PERMISSION_DESCRIPTIONS: Final[dict[PermissionCode, str]] = {
    PermissionCode.USERS_READ: "View the user directory and user details.",
    PermissionCode.USERS_CREATE: "Create user accounts.",
    PermissionCode.USERS_UPDATE: "Edit user accounts and their role assignments.",
    PermissionCode.USERS_DEACTIVATE: "Deactivate and reactivate user accounts.",
    PermissionCode.USERS_RESET_PASSWORD: "Reset a user's password (the recovery path; no email flow exists).",
    PermissionCode.ROLES_READ: "View roles and their permission matrices.",
    PermissionCode.ROLES_MANAGE: "Create, edit and delete roles and their permission grants.",
    PermissionCode.PERMISSIONS_READ: "View the permission dictionary.",
    PermissionCode.PERMISSIONS_MANAGE: "Add, edit and retire permission codes.",
    PermissionCode.SETTINGS_READ: "View application settings.",
    PermissionCode.SETTINGS_MANAGE: "Change application settings.",
    PermissionCode.AUDIT_READ: "View the audit trail.",
    PermissionCode.NOTIFICATIONS_READ: "View own notifications.",
    PermissionCode.NOTIFICATIONS_MANAGE_OWN: "Mark, clear and delete own notifications.",
    PermissionCode.FILES_READ: "Download stored files within authorization.",
    PermissionCode.FILES_CREATE: "Upload files.",
    PermissionCode.REPORTS_GENERATE: "Generate reports and PDFs from authorized data.",
}

# Declaration order, for stable seed output and tests. `tuple(...)` of the enum
# is the same list; the name exists so callers never re-derive it differently.
ALL_PERMISSION_CODES: Final[tuple[PermissionCode, ...]] = tuple(PermissionCode)


def effective_permissions(user: User) -> frozenset[str]:
    """Every permission code ``user`` holds — the union, computed per request.

    ARCHITECTURE §6: the effective set is the **union across the user's
    roles**, with one explicit rule for the break-glass flag: ``is_superuser``
    holds *every* code, current and future, without depending on the
    ``super_admin`` role's grant rows having been re-seeded after a new code
    shipped — the seed re-asserts that role's matrix on every run (C16), but
    nothing runs it automatically, and the one account that exists to be
    un-lockable must not be lockable out of a feature by deployment order.
    The seeded role remains the *visible dictionary* of what superuser means
    (F036's protected matrix column), never the mechanism.

    For everyone else the answer is exactly the roles' union — no implicit
    grants, nothing held back (a role change applies on the very next request
    because F029's resolution re-loads this graph from the database, BP-6.3f).

    Reads only loaded relationships (``User.roles`` → ``Role.permissions``
    are ``selectin``, F024): after a request resolves its session this is a
    pure in-memory fold with zero further queries.
    """
    if user.is_superuser:
        return frozenset(ALL_PERMISSION_CODES)
    return frozenset(permission.code for role in user.roles for permission in role.permissions)
