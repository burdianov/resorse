"""Admin role shapes (F034's read slice; F035 completes the surface).

F034 pulled the read-only list forward from F035 deliberately (C23): the user
dialogs' role picker needed the real catalogue. F035 adds the CRUD shapes and
the matrix save, and extends the item with `permission_codes` — the matrix
screen reads roles and their grants in one answer, and the picker ignores the
extra field.

Codes, not ids, identify permissions in requests: the code is the machine
vocabulary (`PermissionCode`), what the seed writes, what the frontend
registry mirrors — and what a human reads in a diff. The service resolves
names to rows and refuses unknown ones as field-addressable 422s.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.identity import Role

# `roles.name` is String(64), `roles.description` String(255).
MAX_ROLE_NAME_LENGTH = 64
MAX_DESCRIPTION_LENGTH = 255


class RoleItem(BaseModel):
    """One role, as the catalogue and the matrix show it."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    # Super_admin's column is protected; the flag says which rows that concerns.
    is_system: bool
    # Sorted codes, so responses diff cleanly and the matrix can compare sets.
    permission_codes: list[str]

    @classmethod
    def from_role(cls, role: Role) -> RoleItem:
        return cls(
            id=role.id,
            name=role.name,
            description=role.description,
            is_system=role.is_system,
            permission_codes=sorted(permission.code for permission in role.permissions),
        )


class RoleListResponse(BaseModel):
    """The whole catalogue, sorted by name — small and unpaginated on purpose:
    a role matrix with more roles than a screen can show is a different
    problem, and F036 will meet it then, not the picker now."""

    items: list[RoleItem]


def _cleaned_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Role name cannot be empty.")
    return cleaned


class CreateRoleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_ROLE_NAME_LENGTH)
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)
    permission_codes: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _cleaned_name(value)


class UpdateRoleRequest(BaseModel):
    """Partial edit with fields-set semantics: absent is untouched, and there
    is no way to change grants here — that is the matrix save's job."""

    name: str | None = Field(default=None, min_length=1, max_length=MAX_ROLE_NAME_LENGTH)
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else _cleaned_name(value)


class MatrixRoleEntry(BaseModel):
    """One column of the matrix save: this role, exactly these codes."""

    role_id: UUID
    permission_codes: list[str]


class SaveMatrixRequest(BaseModel):
    """The atomic save (BP-7.4): every listed role's grant set is replaced in
    one transaction. A UI that sends its whole visible matrix includes the
    protected `super_admin` column unchanged — the service accepts that and
    refuses any actual change to it."""

    roles: list[MatrixRoleEntry]
