"""The projects module's rules (D008): the CRUD behind `/api/v1/projects`.

`app/api/v1/projects.py` stays thin; the decisions live here (C26's split). One
resource, so unlike the reference tables there is no shared-exception economy to
explain — but the four rules are the same four, and each is worth stating
because a later module inherits them:

- **The code is the identity and is set once.** `create` writes it; nothing here
  changes it. What makes that identity *real* rather than a convention is
  D007's index, and it is a **partial** one: a code is unique among **live**
  projects, so a retired tender's code is free again (C57's award reuses it) and
  an insert that collides with a live row is a 409 rather than a duplicate that
  quietly exists. This layer did not have to say "among live projects" anywhere
  — the predicate is the database's — but the *sentence* the caller reads says
  it, because "A project with this code already exists" would be false the day
  an awarded project legitimately shares one.
- **The dates are ordered, and the refusal names the field.** The model's two
  CHECKs are the floor; this layer refuses first so a typo is a 422 rather than
  a `CheckViolation` a client reads as a 500. The schema catches a payload that
  carries both sides (it can compare them without the row); what is left for
  here is the mixed case — a payload that moves the start against a stored
  completion, or a completion against a stored start — which needs the merged
  row, and the field it names is the one the caller submitted.
- **Deleting a project is not how its history ends.** `delete` attempts the real
  delete and translates a foreign-key refusal into a 409. Nothing references
  `projects` yet, so in this revision the delete of an unreferenced row always
  succeeds and the refusal arm is *unreachable* — it stays because the rule is
  §2's, not this revision's: `project_memberships` (D019) and the forecast
  tables (D020+) will carry a `project_id`, and the day they land this function
  already refuses correctly instead of raising a 500. This is also why the
  refusal carries **no advice**: the reference tables' message says "Deactivate
  it instead" because they have an `is_active` flag, and a project does not —
  its `retired` state is the award's own transition (C57), not a general off
  switch, so inventing one here would put a second meaning on the word.
- **Every mutation is audited, in its own transaction** (`audit.record` into the
  session this function commits, F043), and the diff records dates as ISO
  strings — JSONB stores JSON, and a `date` would fail at the column rather than
  at the reviewer's eye.

**No transition machine.** `status` moves like any other field: D008 owns the
lifecycle *field* (§3's matrix: "create / edit a project, its lifecycle
status"), and C57's award — the second row, the retired tender, the copied plan,
one award only — is D033's conversion on its own route. A guard invented here
would be a second implementation of D033's rule, which is what C64 refused to do
with the delete rule and D007 refused to do with uniqueness.
"""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import User
from app.models.projects import Project
from app.services import audit


class ProjectNotFound(Exception):
    """No such project. The message names the resource."""


class ProjectCodeTaken(Exception):
    """Another **live** project already carries this code (the partial index's
    verdict — a retired row does not collide)."""


class ProjectInUse(Exception):
    """A foreign key refused the delete: something still references the row.

    Raised from the database's own `ON DELETE RESTRICT` rather than from a count
    kept here — one implementation of §2's write boundary, and it covers tables
    this module has not met yet.
    """


class DateOrderViolation(Exception):
    """A completion would precede the start, or the start would follow a
    completion. Carries the field the caller submitted, so the form layer can
    put the sentence on the right control (F037's shape)."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


# The columns a caller may sort by. A map rather than a `getattr`, so an
# unknown name is impossible rather than merely unlikely: the route narrows the
# parameter to these keys, and this dict is what turns one into a column.
SORTABLE_FIELDS: dict[str, Any] = {
    "code": Project.code,
    "name": Project.name,
    "status": Project.status,
    "start_date": Project.start_date,
    "contractual_completion": Project.contractual_completion,
    "forecast_completion": Project.forecast_completion,
    "created_at": Project.created_at,
}


async def list_projects(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    status: str | None,
    sort: str,
    order: str,
) -> tuple[list[Project], int]:
    """One page of projects and the total the filters match."""
    criteria = project_criteria(search, status)
    total = await session.scalar(select(func.count()).select_from(Project).where(*criteria))
    statement = (
        select(Project)
        .where(*criteria)
        .order_by(*project_ordering(sort=sort, order=order))
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return list(await session.scalars(statement)), int(total or 0)


def project_criteria(search: str | None, status: str | None) -> list[Any]:
    """The predicate the project list *is*.

    Shared the way the user directory's is (``directory_criteria``): a later
    report that draws "only authorized projects" must call the same clause
    rather than keep a second WHERE that agrees today. `search` matches the code
    and the name, because those are the two things a caller knows about a
    project.
    """
    criteria: list[Any] = []
    if search:
        pattern = f"%{_escape_like(search.strip())}%"
        criteria.append(or_(Project.code.ilike(pattern), Project.name.ilike(pattern)))
    if status is not None:
        criteria.append(Project.status == status)
    return criteria


def project_ordering(*, sort: str, order: str) -> tuple[Any, ...]:
    """The list's order, with ``id`` as a tiebreaker.

    A *total* order, or two pages can disagree about where a row belongs while a
    request is in flight (the user directory's rule, C22).
    """
    column = SORTABLE_FIELDS[sort]
    return (column.desc() if order == "desc" else column.asc(), Project.id.asc())


async def get_project(session: AsyncSession, project_id: uuid.UUID) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise ProjectNotFound("Project not found.")
    return project


async def create_project(
    session: AsyncSession,
    *,
    actor: User,
    code: str,
    name: str,
    status: str,
    start_date: date,
    contractual_completion: date,
    forecast_completion: date,
) -> Project:
    """Create a project. The dates arrive already ordered — the schema compared
    them — and the CHECKs stay the floor under this."""
    project = Project(
        code=code,
        name=name,
        status=status,
        start_date=start_date,
        contractual_completion=contractual_completion,
        forecast_completion=forecast_completion,
    )
    session.add(project)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise ProjectCodeTaken(
            "A live project already uses this code. Retire the project that holds it, "
            "or choose another code."
        ) from error
    await audit.record(
        session,
        actor=actor,
        action="project.create",
        entity_type="project",
        entity_id=project.id,
        summary=f"Created project {project.code}.",
        details={
            "code": project.code,
            "name": project.name,
            "status": project.status,
            "start_date": project.start_date.isoformat(),
            "contractual_completion": project.contractual_completion.isoformat(),
            "forecast_completion": project.forecast_completion.isoformat(),
        },
    )
    await session.commit()
    return project


async def update_project(
    session: AsyncSession,
    *,
    actor: User,
    target: Project,
    name: str | None,
    status: str | None,
    start_date: date | None,
    contractual_completion: date | None,
    forecast_completion: date | None,
) -> Project:
    """Edit the name, the status and the three dates. Not the code.

    The order check runs on the **merged** row: the schema can only compare the
    two dates when one payload carries both, and the interesting typo is the
    caller who moves one side by itself. The field named is the one submitted.
    """
    _check_dates(
        target,
        start_date=start_date,
        contractual_completion=contractual_completion,
        forecast_completion=forecast_completion,
    )
    before = _snapshot(target)
    if name is not None:
        target.name = name
    if status is not None:
        target.status = status
    if start_date is not None:
        target.start_date = start_date
    if contractual_completion is not None:
        target.contractual_completion = contractual_completion
    if forecast_completion is not None:
        target.forecast_completion = forecast_completion
    await audit.record(
        session,
        actor=actor,
        action="project.update",
        entity_type="project",
        entity_id=target.id,
        summary=f"Updated project {target.code}.",
        details={"before": before, "after": _snapshot(target)},
    )
    await session.commit()
    # `updated_at` is IO after an UPDATE (ARCHITECTURE §12) — refresh before
    # anything serialises the row.
    await session.refresh(target)
    return target


async def delete_project(session: AsyncSession, *, actor: User, target: Project) -> None:
    """Delete a project nothing references; 409 once something does (§2's write
    boundary — the refusal arm arrives with D019's and D020's foreign keys)."""
    await audit.record(
        session,
        actor=actor,
        action="project.delete",
        entity_type="project",
        entity_id=target.id,
        summary=f"Deleted project {target.code}.",
        details={"code": target.code},
    )
    await session.delete(target)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ProjectInUse(
            "This project has forecasts or assignments and cannot be deleted."
        ) from error


def _check_dates(
    target: Project,
    *,
    start_date: date | None,
    contractual_completion: date | None,
    forecast_completion: date | None,
) -> None:
    """The pair rule against the row, after the submitted fields are applied.

    Only the field the caller actually submitted can be blamed, and the order of
    the two passes is what enforces that: a submitted completion that precedes
    the (possibly new) start is the *completion's* fault, and a submitted start
    that overtakes a **stored** completion — neither completion came in — is the
    start's. Blaming a stored date the caller never sent would put the sentence
    on a control they cannot see, which is the one thing a field-addressable
    refusal must not do.
    """
    effective_start = start_date if start_date is not None else target.start_date
    for field, submitted in (
        ("contractual_completion", contractual_completion),
        ("forecast_completion", forecast_completion),
    ):
        if submitted is not None and submitted < effective_start:
            raise DateOrderViolation(field, "A completion cannot be before the start date.")
    if start_date is not None:
        latest = max(
            contractual_completion
            if contractual_completion is not None
            else target.contractual_completion,
            forecast_completion if forecast_completion is not None else target.forecast_completion,
        )
        if start_date > latest:
            raise DateOrderViolation(
                "start_date", "The start date cannot be after the project's completion dates."
            )


def _snapshot(project: Project) -> dict[str, object]:
    """The audited fields, as JSON — dates as ISO strings (see the docstring)."""
    return {
        "name": project.name,
        "status": project.status,
        "start_date": project.start_date.isoformat(),
        "contractual_completion": project.contractual_completion.isoformat(),
        "forecast_completion": project.forecast_completion.isoformat(),
    }


def _escape_like(value: str) -> str:
    """A search term is a *term*, not a pattern: ``%`` and ``_`` match
    themselves (the user directory's rule, C22)."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
