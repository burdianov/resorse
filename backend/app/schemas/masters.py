"""The reference tables' shapes (D005): disciplines, departments, designations.

The first Stage B DTOs, and the first that describe **reference rows** rather
than people or authority. Three plain resources, one contract: a list, one
item, a create, a partial edit, and a delete — so the shapes differ only where
the tables do (a department carries a classification; a designation carries
its two references).

Rules this file carries, all of them mirroring the model rather than restating
it:

- **The code is validated against the model's own pattern** (imported, never
  re-typed — `app/models/masters.py` owns the spelling, the CHECK enforces the
  same shape at the floor). It is trimmed and then matched exactly: a code is a
  machine-stable identifier, and quietly lowercasing `Civil` would make two
  spellings mean the same row.
- **The classification is a `Literal` of the two tokens the product has.** The
  model's own note says D005's schema mirrors `DEPARTMENT_CLASSIFICATIONS`;
  a test pins the two spellings together so the mirror cannot drift, and the
  literal is what puts the closed vocabulary into the generated client as an
  enum instead of leaving the UI to hardcode it.
- **`code` appears on the create shapes and never on the update ones.** It is
  the identity: renaming it is what every stored reference would have to
  follow, so the edit shapes do not offer it and carry `extra="forbid"` — an
  attempt to change a code is a 422 at the unknown field, never a PATCH that
  silently succeeds and does nothing.
- **A `null` for a required field means "not submitted", not "set it to
  null"** (the `admin_roles` precedent). Nothing here is nullable, so the
  routers treat `None` as absent, and a payload that is *only* nulls is the
  same empty edit as `{}`.

Names are prose and normalise like everywhere else — trimmed, and a blank one
is refused rather than stored, which is the service-side twin of the model's
`name_is_present` CHECK. Lists are unpaginated for the reason the permission
dictionary's are: these are bounded vocabularies an operator curates, and the
screens that render them render all of them.
"""

import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.masters import CODE_PATTERN, MAX_CODE_LENGTH, MAX_NAME_LENGTH

_CODE_RE = re.compile(CODE_PATTERN)
# `departments.classification` is String(16) — the longer of the two tokens
# plus room to grow, and the width the schema checks against.
MAX_CLASSIFICATION_LENGTH = 16

# The closed vocabulary, as a literal: `DEPARTMENT_CLASSIFICATIONS` in the
# model is the same two tokens, and `tests/test_masters_api.py` asserts the
# two spellings are equal, so a third classification is a decision made once.
DepartmentClassification = Literal["HEAD_OFFICE", "SITE"]


def _validated_code(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) > MAX_CODE_LENGTH:
        raise ValueError(f"Codes are at most {MAX_CODE_LENGTH} characters.")
    if not _CODE_RE.fullmatch(cleaned):
        raise ValueError("A code is a lowercase slug, e.g. `civil` or `site_a`.")
    return cleaned


def _cleaned_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Name cannot be empty.")
    return cleaned


# --- disciplines --------------------------------------------------------------


class DisciplineItem(BaseModel):
    """One discipline, as the list and the edit dialog show it."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    is_active: bool


class DisciplineListResponse(BaseModel):
    """The whole list, sorted by code — the order the service returns and the
    only order the screens have to agree on."""

    items: list[DisciplineItem]


class CreateDisciplineRequest(BaseModel):
    code: str = Field(min_length=1, max_length=MAX_CODE_LENGTH)
    name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        return _validated_code(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _cleaned_name(value)


class UpdateDisciplineRequest(BaseModel):
    """Partial edit: the name and the active flag, and nothing else. The flag
    is how a discipline that is still referenced is retired — the delete
    route refuses while a designation names it."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME_LENGTH)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else _cleaned_name(value)


# --- departments --------------------------------------------------------------


class DepartmentItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    classification: DepartmentClassification
    is_active: bool


class DepartmentListResponse(BaseModel):
    items: list[DepartmentItem]


class CreateDepartmentRequest(BaseModel):
    code: str = Field(min_length=1, max_length=MAX_CODE_LENGTH)
    name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)
    classification: DepartmentClassification


class UpdateDepartmentRequest(BaseModel):
    """The classification is editable here, unlike the code: it is an
    attribute *of* the row, and a head office that is reclassified as a site
    is a correction, not a new identity."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME_LENGTH)
    classification: DepartmentClassification | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else _cleaned_name(value)


# --- designations -------------------------------------------------------------


class DesignationItem(BaseModel):
    """One job title and the two rows it belongs to.

    The references are ids, not nested objects: the list the screen needs is
    already loaded, so a dialog joins them client-side against the two lists it
    has. Nesting them here would make every response carry the same department
    twice and force a second way to read it.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    department_id: UUID
    discipline_id: UUID
    is_active: bool


class DesignationListResponse(BaseModel):
    items: list[DesignationItem]


class CreateDesignationRequest(BaseModel):
    code: str = Field(min_length=1, max_length=MAX_CODE_LENGTH)
    name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)
    # Required, like the columns: a title that belongs to no department or no
    # discipline is not a state the table represents. An id that names no row
    # is refused by the service as a field-addressable 422, not by the foreign
    # key as a 500.
    department_id: UUID
    discipline_id: UUID

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        return _validated_code(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _cleaned_name(value)


class UpdateDesignationRequest(BaseModel):
    """The two references are editable: a title that moves to another
    department is the same title, and nothing points at a designation yet —
    when D014's employees do, a move stays this cheap, because the reference
    is an id the row carries rather than a name stored beside it."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME_LENGTH)
    department_id: UUID | None = None
    discipline_id: UUID | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else _cleaned_name(value)
