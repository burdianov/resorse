"""Admin user management shapes (F033).

The response item is the *directory* view of an account: identity, lifecycle
flags, role names **and** ids (badges need names, the edit dialog's multiselect
needs ids), and timestamps. ``hashed_password`` is absent by construction —
the schema is built from the model, never the other way round — and a test
asserts the string never appears in a response.

Requests validate shape only where the shape is knowable here: ``full_name``
is trimmed and must survive trimming (the database CHECK demands the same),
emails use ``EmailStr`` (C15 fixed that validator as the one this API uses),
and the *password policy* deliberately runs in the service — the denylist's
email rule needs the canonical address, and only the service owns
canonicalisation (F024). A policy refusal therefore arrives as a
field-addressable 422 on ``password``, not a schema error.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.identity import User

# `users.full_name` is String(200), `users.phone` String(32).
MAX_FULL_NAME_LENGTH = 200
MAX_PHONE_LENGTH = 32
# The hostile-body cap for an explicitly supplied password; the real bound is
# `Settings.password_max_length` and reaches the caller as a 422.
MAX_PASSWORD_LENGTH = 1024


class RoleRef(BaseModel):
    """A role as the directory shows it: what to display and what to submit."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class AdminUserItem(BaseModel):
    """One account, as every admin endpoint returns it."""

    id: UUID
    email: str
    full_name: str
    phone: str | None
    is_active: bool
    is_deleted: bool
    is_superuser: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    roles: list[RoleRef]

    @classmethod
    def from_user(cls, user: User) -> AdminUserItem:
        """Build from the ORM row — roles sorted by name, so responses diff."""
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            is_active=user.is_active,
            is_deleted=user.is_deleted,
            is_superuser=user.is_superuser,
            must_change_password=user.must_change_password,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
            roles=[
                RoleRef.model_validate(role) for role in sorted(user.roles, key=lambda r: r.name)
            ],
        )


class UserListResponse(BaseModel):
    """One page of the directory, with the server's total — the footer count
    and the page contents can therefore never disagree (ARCHITECTURE §10)."""

    items: list[AdminUserItem]
    total: int
    page: int
    page_size: int


def _cleaned_full_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Full name cannot be empty.")
    return cleaned


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=MAX_FULL_NAME_LENGTH)
    phone: str | None = Field(default=None, max_length=MAX_PHONE_LENGTH)
    role_ids: list[UUID] = Field(default_factory=list)
    is_superuser: bool = False
    # Omitted → the server generates one and shows it exactly once in the
    # response (`temporary_password`); supplied → the admin owns the value and
    # the response does not echo it back.
    password: str | None = Field(default=None, min_length=1, max_length=MAX_PASSWORD_LENGTH)

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str) -> str:
        return _cleaned_full_name(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class UpdateUserRequest(BaseModel):
    """A partial edit. Absence and explicit ``null`` differ: an absent field
    is untouched, ``"phone": null`` clears the phone. The endpoint reads
    ``model_fields_set`` — the model itself cannot express the difference."""

    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=MAX_FULL_NAME_LENGTH)
    phone: str | None = Field(default=None, max_length=MAX_PHONE_LENGTH)
    role_ids: list[UUID] | None = None
    is_active: bool | None = None

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str | None) -> str | None:
        return None if value is None else _cleaned_full_name(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class CreateUserResponse(BaseModel):
    user: AdminUserItem
    # Present exactly once — when the *server* generated the initial password.
    temporary_password: str | None


class ResetPasswordResponse(BaseModel):
    # Shown exactly once by the admin who asked; never retrievable again.
    temporary_password: str
