"""The project shapes (D008): the first DTOs about a *working* row.

The reference tables are vocabularies an operator curates; a project is the row
the rest of the product plans people against, so these shapes differ where its
*rules* do. Everything the reference tables taught still holds — the code is the
identity and is not editable, the edit shape forbids extras, a `null` for a
non-nullable field means "not submitted" — and three things are new:

- **The status is a `Literal` of the model's own vocabulary.** `PROJECT_STATUSES`
  generates the CHECK and the partial index's predicate (D007); this literal is
  the third reader of it, and `tests/test_projects_api.py` asserts the two are
  equal so a fourth state is a decision made once rather than an enum that
  disagrees with the database. It also puts the vocabulary into the generated
  client, so no screen hardcodes tender/awarded/retired.
- **The dates are `date`, not `datetime`, and they have an order.** D007 made
  these the tree's first calendar-day columns; "a completion is never before the
  start" is a *typo* rule, and a typo must arrive as a field-addressable 422
  rather than a `CheckViolation` the caller reads as a 500. The schema checks the
  pair **when one payload carries both** (the create shape always does, the edit
  shape only sometimes), names the completion field, and leaves the mixed case —
  one side submitted against the row's stored other — to the service, which is
  the only layer that can see the merged row. The CHECK stays the floor beneath.
- **Nothing here sets the responsible person.** §3's matrix gives that action its
  own code (`projects.responsibility`) and its own task (D019), so
  `responsible_user_id` is **read-only on every shape**: it appears on the item
  (a screen must render who is answerable) and on no request. D019 adds the
  write, under its own code, with the membership table the scope rules need.

`status` defaults to `tender` on create — the lifecycle's first state is not an
invention (PRODUCT_SPEC §4's tender/awarded lifecycle begins there), and a create
that had to say it would make every caller repeat the only possible starting
value. Nothing is defaulted on edit, where absence means "unchanged".

**No transition machine lives here.** §3's matrix gives D008 "create / edit a
project, its lifecycle status" — the field, not the conversion. Awarding is
C57's explicit conversion (a second row, the tender retired and kept as history,
the plan copied, and one award only), which is D033's own task; a guard invented
here would be a second implementation of the rule D033 owns, and the identity
rule it rests on — one live project per code — is already the partial index's.
"""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from app.models.projects import MAX_CODE_LENGTH, MAX_NAME_LENGTH

# The closed vocabulary, as a literal: the model's `PROJECT_STATUSES` is the
# same three strings, and a test asserts the two are equal (see the docstring).
ProjectStatus = Literal["tender", "awarded", "retired"]

# The list's paging bounds, matching the user directory's (C22: default 25, cap
# 100 — the DataTable's own sizes). Named here rather than spelled into the
# route so the service and the contract quote one number.
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100

_NOT_BEFORE_START = "A completion cannot be before the project's start date."


def _cleaned_code(value: str) -> str:
    """Trimmed, non-empty, and **not** shaped.

    The model's note is the rule: a project code is business data — a real one
    looks like a contract number — so the reference tables' slug pattern is
    deliberately not borrowed. The 32-character width is the one §3's
    business-code rule groups with their codes.
    """
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Code cannot be empty.")
    return cleaned


def _cleaned_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Name cannot be empty.")
    return cleaned


def _completion_not_before_start(value: date, info: ValidationInfo) -> date:
    """The pair rule for a payload that carries both sides.

    Called from a field validator so the refusal lands on the *completion* — the
    value the caller can fix — rather than on the model. When the start is
    missing from this payload the check belongs to the service, the only place
    that can see the stored value.
    """
    start = info.data.get("start_date")
    if start is not None and value < start:
        raise ValueError(_NOT_BEFORE_START)
    return value


class ProjectItem(BaseModel):
    """One project, as the list and the detail screen show it.

    The dates are ISO calendar days (D007's rule), and `responsible_user_id` is
    present but **read-only** — the screen needs to render who is answerable,
    and no request shape accepts it (D019 owns the write, §3's matrix).
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    status: ProjectStatus
    start_date: date
    contractual_completion: date
    forecast_completion: date
    responsible_user_id: UUID | None


class ProjectListResponse(BaseModel):
    """One page of projects, and the total the filters match.

    Paginated, unlike the reference tables' lists, and for the reason those are
    not: a vocabulary is bounded and an operator curates it, while projects
    accumulate — a list that renders all of them is a list that stops working
    the year the company wins enough work. `total` counts everything the filters
    match, so the footer cannot disagree with the page it describes
    (ARCHITECTURE §10).
    """

    items: list[ProjectItem]
    total: int
    page: int
    page_size: int


class CreateProjectRequest(BaseModel):
    """A new project.

    Field order matters: `start_date` precedes the two completions so the pair
    check can read it out of ``info.data``.
    """

    code: str = Field(min_length=1, max_length=MAX_CODE_LENGTH)
    name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)
    status: ProjectStatus = "tender"
    start_date: date
    contractual_completion: date
    forecast_completion: date

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        return _cleaned_code(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _cleaned_name(value)

    @field_validator("contractual_completion", "forecast_completion")
    @classmethod
    def _completion(cls, value: date, info: ValidationInfo) -> date:
        return _completion_not_before_start(value, info)


class UpdateProjectRequest(BaseModel):
    """A partial edit: the name, the status and the three dates.

    The **code is not editable** — it is the identity (D002's rule, carried by
    every table since), and `extra="forbid"` turns an attempted rename into a
    422 at the unknown field rather than a 200 that quietly did nothing.
    `responsible_user_id` is forbidden for a different reason: that action has
    its own code and its own task (D019), so this shape does not reach it at all.

    The pair check runs only when the payload carries both dates; a payload that
    moves one side against the row's stored other is the service's to refuse,
    because the schema cannot see the row.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME_LENGTH)
    status: ProjectStatus | None = None
    start_date: date | None = None
    contractual_completion: date | None = None
    forecast_completion: date | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else _cleaned_name(value)

    @field_validator("contractual_completion", "forecast_completion")
    @classmethod
    def _completion(cls, value: date | None, info: ValidationInfo) -> date | None:
        return None if value is None else _completion_not_before_start(value, info)


__all__ = [
    "DEFAULT_PAGE_SIZE",
    "MAX_PAGE_SIZE",
    "CreateProjectRequest",
    "ProjectItem",
    "ProjectListResponse",
    "ProjectStatus",
    "UpdateProjectRequest",
]
