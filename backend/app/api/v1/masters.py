"""The reference tables (D005): the protected CRUD surface over all three.

The first Stage B endpoints, and the first that guard on domain codes. The
rules are in ``app/services/masters.py``; this file is the translation layer —
the same split every admin router in this tree has (C26).

Three resources, one contract, one guard pair each
(``disciplines.read``/``disciplines.manage``, and so on — DOMAIN_ARCHITECTURE
§3). All six are **global** codes: a discipline, a department and a designation
are company-wide vocabularies rather than rows that belong to a caller, so
nothing here narrows by user or project, and a foreign id that names no row is
a 404 (the row is not hidden) or a 422 (the reference was submitted) — never a
403, which would claim an authority the caller may well have.

`delete` is offered on all three and refuses with a 409 while the row is
referenced, because the reference tables are the operator's own vocabulary: a
row nothing points at should be removable, and a row that *is* pointed at is
deactivated through `patch` (the product's "deactivate, never delete where a
row is referenced", DOMAIN_ARCHITECTURE §3). The refusal comes from the
database's `ON DELETE RESTRICT`, not from a check here.

The sub-routers exist so each resource's five operations read as one block; the
prefix stays ``/masters`` rather than ``/admin`` because these tables belong to
the domain, not to the foundation's administration surface.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.api.v1.errors import field_error
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.schemas.masters import (
    CreateDepartmentRequest,
    CreateDesignationRequest,
    CreateDisciplineRequest,
    DepartmentItem,
    DepartmentListResponse,
    DesignationItem,
    DesignationListResponse,
    DisciplineItem,
    DisciplineListResponse,
    UpdateDepartmentRequest,
    UpdateDesignationRequest,
    UpdateDisciplineRequest,
)
from app.services import masters as masters_service
from app.services.sessions import SessionContext

router = APIRouter(prefix="/masters")
disciplines = APIRouter(prefix="/disciplines")
departments = APIRouter(prefix="/departments")
designations = APIRouter(prefix="/designations")

DOMAIN_ERRORS = (
    masters_service.MasterNotFound,
    masters_service.MasterCodeTaken,
    masters_service.MasterInUse,
    masters_service.UnknownReference,
)


def _to_http(exc: Exception) -> HTTPException:
    """The translation table: service rule → status.

    The three exceptions that carry a sentence carry it straight through —
    "Discipline not found.", "A department with this code already exists.",
    "This discipline is still used by designations…" — because the service
    knows which noun the caller was working on and this layer does not.
    ``UnknownReference`` is the one that becomes a **field-addressable** 422,
    addressed to the `department_id` / `discipline_id` the caller submitted
    (F037's shape for unknown permission codes).
    """
    if isinstance(exc, masters_service.MasterNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, masters_service.MasterCodeTaken):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, masters_service.MasterInUse):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, masters_service.UnknownReference):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error(exc.field, exc.message)],
        )
    raise exc


def _submitted(payload: BaseModel) -> bool:
    """Did the caller submit anything that is actually a value?

    Fields-set semantics with a twist: nothing on the edit shapes is nullable,
    so a field sent as ``null`` is a field the caller did not fill in, and a
    payload of nothing but nulls is the same empty edit as ``{}``. Both are a
    400 rather than a 200 that quietly changed nothing.
    """
    return any(value is not None for value in payload.model_dump(exclude_unset=True).values())


# --- disciplines --------------------------------------------------------------


@disciplines.get(
    "",
    response_model=DisciplineListResponse,
    summary="List the disciplines",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the disciplines.read permission."},
    },
)
async def list_disciplines(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DISCIPLINES_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DisciplineListResponse:
    """Every discipline, deactivated ones included, sorted by code."""
    rows = await masters_service.list_disciplines(session)
    return DisciplineListResponse(items=[DisciplineItem.model_validate(row) for row in rows])


@disciplines.post(
    "",
    response_model=DisciplineItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a discipline",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the disciplines.manage permission."},
        409: {"description": "A discipline with this code already exists."},
        422: {"description": "Shape errors in the submitted fields."},
    },
)
async def create_discipline(
    payload: CreateDisciplineRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DISCIPLINES_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DisciplineItem:
    try:
        discipline = await masters_service.create_discipline(
            session, actor=context.user, code=payload.code, name=payload.name
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DisciplineItem.model_validate(discipline)


@disciplines.get(
    "/{discipline_id}",
    response_model=DisciplineItem,
    summary="One discipline",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the disciplines.read permission."},
        404: {"description": "No such discipline."},
    },
)
async def get_discipline(
    discipline_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DISCIPLINES_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DisciplineItem:
    try:
        discipline = await masters_service.get_discipline(session, discipline_id)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DisciplineItem.model_validate(discipline)


@disciplines.patch(
    "/{discipline_id}",
    response_model=DisciplineItem,
    summary="Rename or deactivate a discipline",
    responses={
        400: {"description": "An empty edit (no values submitted)."},
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the disciplines.manage permission."},
        404: {"description": "No such discipline."},
    },
)
async def update_discipline(
    discipline_id: uuid.UUID,
    payload: UpdateDisciplineRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DISCIPLINES_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DisciplineItem:
    """The name and the active flag. The code is the identity and is not
    editable — an attempt to send one is a 422 at the unknown field."""
    if not _submitted(payload):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No changes were submitted."
        )
    try:
        target = await masters_service.get_discipline(session, discipline_id)
        updated = await masters_service.update_discipline(
            session,
            actor=context.user,
            target=target,
            name=payload.name,
            is_active=payload.is_active,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DisciplineItem.model_validate(updated)


@disciplines.delete(
    "/{discipline_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an unused discipline",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the disciplines.manage permission."},
        404: {"description": "No such discipline."},
        409: {"description": "A designation still names this discipline."},
    },
)
async def delete_discipline(
    discipline_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DISCIPLINES_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        target = await masters_service.get_discipline(session, discipline_id)
        await masters_service.delete_discipline(session, actor=context.user, target=target)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc


# --- departments --------------------------------------------------------------


@departments.get(
    "",
    response_model=DepartmentListResponse,
    summary="List the departments",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the departments.read permission."},
    },
)
async def list_departments(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DEPARTMENTS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DepartmentListResponse:
    """Every department, deactivated ones included, sorted by code."""
    rows = await masters_service.list_departments(session)
    return DepartmentListResponse(items=[DepartmentItem.model_validate(row) for row in rows])


@departments.post(
    "",
    response_model=DepartmentItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a department",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the departments.manage permission."},
        409: {"description": "A department with this code already exists."},
        422: {"description": "Shape errors, or a classification that is not one of the two."},
    },
)
async def create_department(
    payload: CreateDepartmentRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DEPARTMENTS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DepartmentItem:
    try:
        department = await masters_service.create_department(
            session,
            actor=context.user,
            code=payload.code,
            name=payload.name,
            classification=payload.classification,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DepartmentItem.model_validate(department)


@departments.get(
    "/{department_id}",
    response_model=DepartmentItem,
    summary="One department",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the departments.read permission."},
        404: {"description": "No such department."},
    },
)
async def get_department(
    department_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DEPARTMENTS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DepartmentItem:
    try:
        department = await masters_service.get_department(session, department_id)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DepartmentItem.model_validate(department)


@departments.patch(
    "/{department_id}",
    response_model=DepartmentItem,
    summary="Rename, reclassify or deactivate a department",
    responses={
        400: {"description": "An empty edit (no values submitted)."},
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the departments.manage permission."},
        404: {"description": "No such department."},
        422: {"description": "A classification that is not one of the two."},
    },
)
async def update_department(
    department_id: uuid.UUID,
    payload: UpdateDepartmentRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DEPARTMENTS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DepartmentItem:
    """The name, the classification and the active flag. The classification is
    editable — it is an attribute of the row, unlike the code."""
    if not _submitted(payload):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No changes were submitted."
        )
    try:
        target = await masters_service.get_department(session, department_id)
        updated = await masters_service.update_department(
            session,
            actor=context.user,
            target=target,
            name=payload.name,
            classification=payload.classification,
            is_active=payload.is_active,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DepartmentItem.model_validate(updated)


@departments.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an unused department",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the departments.manage permission."},
        404: {"description": "No such department."},
        409: {"description": "A designation still names this department."},
    },
)
async def delete_department(
    department_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DEPARTMENTS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        target = await masters_service.get_department(session, department_id)
        await masters_service.delete_department(session, actor=context.user, target=target)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc


# --- designations -------------------------------------------------------------


@designations.get(
    "",
    response_model=DesignationListResponse,
    summary="List the designations",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the designations.read permission."},
    },
)
async def list_designations(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DESIGNATIONS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DesignationListResponse:
    """Every designation, deactivated ones included, sorted by code."""
    rows = await masters_service.list_designations(session)
    return DesignationListResponse(items=[DesignationItem.model_validate(row) for row in rows])


@designations.post(
    "",
    response_model=DesignationItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a designation",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the designations.manage permission."},
        409: {"description": "A designation with this code already exists."},
        422: {"description": "Shape errors, or a department/discipline that does not exist."},
    },
)
async def create_designation(
    payload: CreateDesignationRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DESIGNATIONS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DesignationItem:
    try:
        designation = await masters_service.create_designation(
            session,
            actor=context.user,
            code=payload.code,
            name=payload.name,
            department_id=payload.department_id,
            discipline_id=payload.discipline_id,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DesignationItem.model_validate(designation)


@designations.get(
    "/{designation_id}",
    response_model=DesignationItem,
    summary="One designation",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the designations.read permission."},
        404: {"description": "No such designation."},
    },
)
async def get_designation(
    designation_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DESIGNATIONS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DesignationItem:
    try:
        designation = await masters_service.get_designation(session, designation_id)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DesignationItem.model_validate(designation)


@designations.patch(
    "/{designation_id}",
    response_model=DesignationItem,
    summary="Rename, move or deactivate a designation",
    responses={
        400: {"description": "An empty edit (no values submitted)."},
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the designations.manage permission."},
        404: {"description": "No such designation."},
        422: {"description": "A department or discipline that does not exist."},
    },
)
async def update_designation(
    designation_id: uuid.UUID,
    payload: UpdateDesignationRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DESIGNATIONS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DesignationItem:
    """The name, the two references and the active flag — not the code."""
    if not _submitted(payload):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No changes were submitted."
        )
    try:
        target = await masters_service.get_designation(session, designation_id)
        updated = await masters_service.update_designation(
            session,
            actor=context.user,
            target=target,
            name=payload.name,
            department_id=payload.department_id,
            discipline_id=payload.discipline_id,
            is_active=payload.is_active,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return DesignationItem.model_validate(updated)


@designations.delete(
    "/{designation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an unused designation",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the designations.manage permission."},
        404: {"description": "No such designation."},
        409: {"description": "Something still references this designation."},
    },
)
async def delete_designation(
    designation_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.DESIGNATIONS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        target = await masters_service.get_designation(session, designation_id)
        await masters_service.delete_designation(session, actor=context.user, target=target)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc


router.include_router(disciplines)
router.include_router(departments)
router.include_router(designations)
