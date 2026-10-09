"""The identity tables: users, roles, permissions and their join tables.

ARCHITECTURE §6: a user holds many roles, a role holds many permissions, and a
caller's effective permissions are the **union** across their roles. The model
is deliberately plain — no hierarchy, no inheritance, no wildcards — because
everything the requirement asks for (deny-by-default, least privilege, a
permission matrix an admin can read) falls out of a flat many-to-many.

**One module, not three.** `User.roles` and `Role.users` point at each other;
split across modules that means either a circular import or quoted annotations
that SQLAlchemy has to resolve at mapper-configuration time. Keeping the group
together removes the problem instead of managing it — and these five tables
change together anyway.

Fields per BIG-PROMPT §6.1a, and **nothing else**: no domain columns, no
company identifier, no relationship to anything the foundation does not own
(§3.1 — the construction domain is Stage B and adds its own tables).

Two invariants are enforced by the database rather than by hope:

- **email is unique**, so two accounts cannot share an address even if two
  requests race (check-then-insert loses that race; the unique index does not);
- **email is canonicalised** — stored lowercase, enforced by a CHECK — because
  uniqueness is only meaningful on the canonical form. ``Ada@Example.com`` and
  ``ada@example.com`` are one account, and the database is where that stops
  being a convention. The application canonicalises before writing (F033); the
  constraint is what makes a bug there fail loudly instead of quietly creating
  a duplicate account. A later task that needs case-insensitive *display*
  stores the original spelling separately rather than breaking this rule.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Table,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_is_canonical"),
        # The unique index carries the query as well: `get_by_email` filters on
        # a lowercased value, so it uses this index rather than scanning.
        Index(None, "email", unique=True),
        CheckConstraint("length(trim(full_name)) > 0", name="full_name_is_present"),
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))

    # Argon2id (F026). Never returned by an API schema, never logged.
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # Account lifecycle. `is_deleted` is the soft delete: rows are never
    # removed, because audit entries and sessions point at them (§8).
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_superuser: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )

    # Forced password change: set by the admin create/reset flows (F033), it
    # gates every regular endpoint until cleared (F031).
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    password_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # The source's invalidation pattern, kept because §6.1a requires the field.
    # Under the opaque-session design (ARCHITECTURE §3) privilege changes are
    # handled by *rotating the session*, so this is the second line: F029
    # decides how (and whether) it is bumped.
    token_version: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))

    # Loading strategy: the auth path needs roles and their permissions on
    # every request, and `selectin` batches them into one extra query instead
    # of raising under async lazy-loading. A query that wants neither can say
    # so with its own loader options.
    roles: Mapped[list[Role]] = relationship(
        secondary="user_roles",
        back_populates="users",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        """Never the hash. SQLAlchemy's default repr lists every loaded
        column, so one stray ``print(user)`` would put an Argon2 hash in a log
        file — "never logged" has to survive the operator's debugging too.
        Identity is enough to be useful; nothing credential-shaped is here.
        """
        return f"User(id={self.id!r}, email={self.email!r})"


# One dot, lowercase resource and action, digits and underscores allowed —
# the codes ARCHITECTURE §6 fixes. The check is the floor, not the ceiling:
# the API validates codes before writing (F037), and this is what stops a
# bad row from a script or a console session.
PERMISSION_CODE_PATTERN = r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$"


class Role(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (
        Index(None, "name", unique=True),
        CheckConstraint("length(trim(name)) > 0", name="name_is_present"),
    )

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    permissions: Mapped[list[Permission]] = relationship(
        secondary="role_permissions",
        back_populates="roles",
        lazy="selectin",
    )
    users: Mapped[list[User]] = relationship(
        secondary="user_roles",
        back_populates="roles",
    )


class Permission(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "permissions"
    __table_args__ = (
        Index(None, "code", unique=True),
        CheckConstraint(
            f"code ~ '{PERMISSION_CODE_PATTERN}'",
            name="code_is_resource_dot_action",
        ),
    )

    code: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    roles: Mapped[list[Role]] = relationship(
        secondary="role_permissions",
        back_populates="permissions",
    )


# --- join tables -----------------------------------------------------------
#
# Plain Core tables rather than mapped classes: a membership row has no
# identity of its own and nothing hangs off it. The composite primary key *is*
# the uniqueness rule (a role cannot be granted twice), and ON DELETE CASCADE
# is what makes deleting a role or a user safe — F035 and F033 rely on it.
#
# The second column of each pair gets its own index: the primary key covers
# lookups by the first column only, and both directions are asked ("who has
# this role?", "which roles grant this permission?" — the latter is F037's
# "cannot delete a permission that is in use").

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Index(None, "role_id"),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "permission_id",
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Index(None, "permission_id"),
)
