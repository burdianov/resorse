"""The projects API (D008) — HTTP plumbing over ``app/services/projects.py``.

Five endpoints, three permission codes, one translation table (C26's split; the
rules are the service's). What is specific to this router rather than to the
reference tables':

- **The list is paginated.** `page`/`page_size`/`search`/`status`/`sort`/`order`
  with the bounds the user directory fixes (C22: default 25, cap 100), because
  projects accumulate where a vocabulary is bounded. `status` is a `Literal` and
  `sort` is a `Literal` over the service's allowlist, so an unknown value is a
  422 the client can read rather than a `KeyError` in a helper.
- **The three codes are separate.** Reading the list, creating a project and
  editing one are three grants (§3's matrix; the reference tables' `read`/
  `manage` pair is deliberately not copied). A caller holding only
  `projects.read` reaches the two GETs and gets a 403 from the other three.
- **`projects.update` guards the delete too.** There is no `projects.delete`
  code: deleting an unreferenced row is an edit of a row nothing depends on,
  and the refusal — 409, once D019's and D020's foreign keys exist — is the same
  `ProjectInUse` the reference tables raise for the same reason.

The **scope** column §3 gives these rows (`project`) is not enforced here and is
not pretended to be: it is D081's, and until `project_memberships` (D019) and
``ScopePolicy`` exist these are role gates like every other code
(``app/core/permissions.py`` records the same thing at the codes).
"""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.api.v1.errors import field_error
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.schemas.projects import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    CreateProjectRequest,
    ProjectItem,
    ProjectListResponse,
    ProjectStatus,
    UpdateProjectRequest,
)
from app.services import projects as projects_service
from app.services.sessions import SessionContext

router = APIRouter(prefix="/projects")

# Everything the service can deliberately refuse with; the translator below
# turns each into the one HTTP answer it means.
DOMAIN_ERRORS = (
    projects_service.ProjectNotFound,
    projects_service.ProjectCodeTaken,
    projects_service.ProjectInUse,
    projects_service.DateOrderViolation,
)

# The orderable columns, as a literal. Kept equal to the service's allowlist by
# a test rather than by a shared object: a `Query` annotation is a static type,
# so the two have to be written twice and the test is what keeps the second copy
# honest.
SortField = Literal[
    "code",
    "name",
    "status",
    "start_date",
    "contractual_completion",
    "forecast_completion",
    "created_at",
]


def _to_http(exc: Exception) -> HTTPException:
    """The translation table: service rule → status.

    Three carry their sentence straight through — "Project not found.", "A live
    project already uses this code. …", "This project has forecasts or
    assignments and cannot be deleted." — because the service knows which noun
    the caller was working on. ``DateOrderViolation`` is the one that becomes a
    **field-addressable** 422, addressed to the date the caller submitted
    (F037's shape for unknown permission codes): the form layer has to put the
    sentence on the right control, and a bare 409 would leave it guessing which
    of three dates to blame.
    """
    if isinstance(exc, projects_service.ProjectNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, projects_service.ProjectCodeTaken):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, projects_service.ProjectInUse):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, projects_service.DateOrderViolation):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error(exc.field, exc.message)],
        )
    raise exc


def _submitted(payload: BaseModel) -> bool:
    """Did the caller submit anything that is actually a value?

    The reference tables' rule: nothing on the edit shape is nullable-with-
    meaning, so a field sent as ``null`` is a field the caller did not fill in,
    and a payload of nothing but nulls is the same empty edit as ``{}``. Both
    are a 400 rather than a 200 that quietly changed nothing.
    """
    return any(value is not None for value in payload.model_dump(exclude_unset=True).values())


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List projects",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the projects.read permission."},
    },
)
async def list_projects(
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.PROJECTS_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status: Annotated[ProjectStatus | None, Query()] = None,
    sort: Annotated[SortField, Query()] = "created_at",
    order: Annotated[Literal["asc", "desc"], Query()] = "desc",
) -> ProjectListResponse:
    """One page of projects, newest first by default.

    ``search`` matches the code and the name — the two things a caller knows
    about a project — and matches them literally (a typed ``%`` is a percent
    sign, not a wildcard). ``total`` counts everything the filters match, so the
    table footer can count without lying (ARCHITECTURE §10).
    """
    rows, total = await projects_service.list_projects(
        session,
        page=page,
        page_size=page_size,
        search=search,
        status=status,
        sort=sort,
        order=order,
    )
    return ProjectListResponse(
        items=[ProjectItem.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "",
    response_model=ProjectItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the projects.create permission."},
        409: {"description": "A live project already uses this code."},
        422: {"description": "Shape errors, or a completion before the start date."},
    },
)
async def create_project(
    payload: CreateProjectRequest,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.PROJECTS_CREATE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectItem:
    """Create a project. ``status`` defaults to ``tender`` — the lifecycle's
    first state — and the code is the identity, set here and never edited."""
    try:
        project = await projects_service.create_project(
            session,
            actor=context.user,
            code=payload.code,
            name=payload.name,
            status=payload.status,
            start_date=payload.start_date,
            contractual_completion=payload.contractual_completion,
            forecast_completion=payload.forecast_completion,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return ProjectItem.model_validate(project)


@router.get(
    "/{project_id}",
    response_model=ProjectItem,
    summary="One project",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the projects.read permission."},
        404: {"description": "No such project."},
    },
)
async def get_project(
    project_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.PROJECTS_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectItem:
    try:
        project = await projects_service.get_project(session, project_id)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return ProjectItem.model_validate(project)


@router.patch(
    "/{project_id}",
    response_model=ProjectItem,
    summary="Edit a project, its status and its dates",
    responses={
        400: {"description": "An empty edit (no values submitted)."},
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the projects.update permission."},
        404: {"description": "No such project."},
        422: {"description": "Shape errors, or a date that would precede the start."},
    },
)
async def update_project(
    project_id: uuid.UUID,
    payload: UpdateProjectRequest,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.PROJECTS_UPDATE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectItem:
    """The name, the status and the three dates. **Not the code** — the identity
    is set at creation and a rename is a 422 at the unknown field — and not the
    responsible person, whose own code and task are D019's.

    ``status`` moves like any other field: D008 ships no transition machine, so
    an edit to ``awarded`` here is a field write, and C57's award conversion is
    D033's own route.
    """
    if not _submitted(payload):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No changes were submitted."
        )
    try:
        target = await projects_service.get_project(session, project_id)
        updated = await projects_service.update_project(
            session,
            actor=context.user,
            target=target,
            name=payload.name,
            status=payload.status,
            start_date=payload.start_date,
            contractual_completion=payload.contractual_completion,
            forecast_completion=payload.forecast_completion,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return ProjectItem.model_validate(updated)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project nothing references",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the projects.update permission."},
        404: {"description": "No such project."},
        409: {"description": "The project still has forecasts or assignments."},
    },
)
async def delete_project(
    project_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.PROJECTS_UPDATE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        target = await projects_service.get_project(session, project_id)
        await projects_service.delete_project(session, actor=context.user, target=target)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
