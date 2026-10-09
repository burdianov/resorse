"""SQLAlchemy models, one module per table group.

Imported for its side effects by ``migrations/env.py``: Alembic's autogenerate
only sees what has been imported, so every new model module is re-exported
here in the same commit that adds it.

F023 shipped the conventions with no tables; F024 adds the identity group
(users, roles, permissions and their join tables); F025 adds sessions; F026
the rate-limit buckets. Each later group arrives with the task that owns it.
"""

from app.models.audit import AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AuditLog
from app.models.identity import Permission, Role, User, role_permissions, user_roles
from app.models.preferences import UserPreference
from app.models.rate_limit import RateLimitBucket
from app.models.session import REVOCATION_REASONS, UserSession
from app.models.settings import AppSetting

__all__ = [
    "AUDIT_ACTIONS",
    "AUDIT_ENTITY_TYPES",
    "REVOCATION_REASONS",
    "AppSetting",
    "AuditLog",
    "Permission",
    "RateLimitBucket",
    "Role",
    "User",
    "UserPreference",
    "UserSession",
    "role_permissions",
    "user_roles",
]
