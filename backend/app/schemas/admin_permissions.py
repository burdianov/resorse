"""Admin permission-dictionary shapes (F036's read slice; F037 completes it).

F036 pulled the read-only list forward from F037 deliberately (C25), the same
move C23 recorded for the roles slice: the matrix screen's row labels are the
permission catalogue — code plus description — and fabricating or hardcoding
it client-side would be a catalogue the server might refuse. F037 adds the
CRUD guardrails (C26).

Codes are validated against the **model's own pattern** (imported, not
re-stated — one spelling, and the database CHECK enforces the same shape at
the floor). A code is *not* silently normalised: uppercase or a missing dot is
a 422, because a code is a machine-stable identifier and quietly correcting it
would make two spellings mean the same authority. Descriptions are prose and
normalise like everywhere else: trimmed, empty → null.
"""

import re
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.identity import PERMISSION_CODE_PATTERN

_CODE_RE = re.compile(PERMISSION_CODE_PATTERN)
# `permissions.code` is String(100), `description` String(255).
MAX_CODE_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 255


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
    and F038's management table can filter client-side over the full list —
    if the dictionary ever grows past a screen, pagination arrives with the
    task that needs it, not before.
    """

    items: list[PermissionItem]


def _validated_code(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) > MAX_CODE_LENGTH:
        raise ValueError(f"Permission codes are at most {MAX_CODE_LENGTH} characters.")
    if not _CODE_RE.fullmatch(cleaned):
        raise ValueError("A permission code is lowercase `resource.action`, e.g. `users.read`.")
    return cleaned


def _cleaned_description(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


class CreatePermissionRequest(BaseModel):
    code: str = Field(min_length=1, max_length=MAX_CODE_LENGTH)
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        return _validated_code(value)

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return _cleaned_description(value)


class UpdatePermissionRequest(BaseModel):
    """Partial edit with fields-set semantics.

    A **code rename** is only permitted while no role holds the code (F037's
    service rule, C26): every existing grant means "the code as it reads" —
    changing the spelling under live grants would silently rewrite what they
    authorise. The description has no such weight and edits freely.
    """

    code: str | None = Field(default=None, min_length=1, max_length=MAX_CODE_LENGTH)
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)

    @field_validator("code")
    @classmethod
    def _code(cls, value: str | None) -> str | None:
        return None if value is None else _validated_code(value)

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return _cleaned_description(value)
