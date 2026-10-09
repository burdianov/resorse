"""Admin permission-dictionary shapes (F036's read slice; F037 extends).

F036 pulled the read-only list forward from F037 deliberately (C25), the same
move C23 recorded for the roles slice: the matrix screen's row labels are the
permission catalogue — code plus description — and fabricating or hardcoding
it client-side would be a catalogue the server might refuse. F037 adds the
CRUD guardrails; the item shape here is what a matrix and a dictionary table
read.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PermissionItem(BaseModel):
    """One permission code, as the dictionary and the matrix show it."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    description: str | None


class PermissionListResponse(BaseModel):
    """The whole dictionary, sorted by code.

    Unpaginated on purpose: the vocabulary is bounded (§6: "add granular
    variants only as needed"), the matrix renders every row by definition,
    and F037 will paginate the management table if and when the list earns
    it — not the matrix now.
    """

    items: list[PermissionItem]
