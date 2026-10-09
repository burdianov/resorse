"""SQLAlchemy models, one module per table group.

Imported for its side effects by ``migrations/env.py``: Alembic's autogenerate
only sees what has been imported, so every new model module is re-exported
here in the same commit that adds it.

F023 shipped the conventions with no tables; F024 adds the identity group
(users, roles, permissions and their join tables); F025 adds sessions. Each
later group arrives with the task that owns it.
"""

from app.models.identity import Permission, Role, User, role_permissions, user_roles
from app.models.session import REVOCATION_REASONS, UserSession

__all__ = [
    "REVOCATION_REASONS",
    "Permission",
    "Role",
    "User",
    "UserSession",
    "role_permissions",
    "user_roles",
]
