"""Admin role shapes (F034 opens the catalogue; F035 extends it).

F034 pulled the read-only list forward from F035 deliberately (C23): the user
dialogs' role picker is F034's named scope, and its options must come from the
real catalogue — inventing them, or shipping the multiselect inert, are both
forbidden. F035 extends this surface with CRUD and the permission matrix; the
item shape here is what a picker and an admin list need, nothing more.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.identity import Role


class RoleItem(BaseModel):
    """One role, as the catalogue lists it."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    # Super_admin's column is protected in F036's matrix; the list says which
    # rows that will concern.
    is_system: bool


def role_item(role: Role) -> RoleItem:
    return RoleItem.model_validate(role)


class RoleListResponse(BaseModel):
    """The whole catalogue, sorted by name — small and unpaginated on purpose:
    a role matrix with more roles than a screen can show is a different
    problem, and F036 will meet it then, not this picker now."""

    items: list[RoleItem]
