"""SQLAlchemy models, one module per table group.

Imported for its side effects by ``migrations/env.py``: Alembic's autogenerate
only sees what has been imported, so every new model module is re-exported
here in the same commit that adds it.

F023 shipped the conventions with no tables; F024 adds the identity group
(users, roles, permissions and their join tables). Each later group arrives
with the task that owns it — sessions with F025, for instance.
"""

from app.models.identity import Permission, Role, User, role_permissions, user_roles

__all__ = [
    "Permission",
    "Role",
    "User",
    "role_permissions",
    "user_roles",
]
