"""Admin role catalogue (F034's read slice; F035 completes the surface).

The catalogue, its CRUD, and the **atomic permission matrix save** — the
endpoint BP-7.4 asks for in place of the reference's sequential PATCH (which
could half-succeed). The rules live in ``app/services/roles.py``; this file
is the translation layer, exactly like ``admin_users.py``.

Guards: reading needs ``roles.read``; every mutation needs ``roles.manage`` —
which the seeded ``admin`` deliberately lacks (C16): managing the authority
dictionaries is privilege escalation by definition, and only ``super_admin``
and custom roles holding the code may do it.

The matrix payload carries **all** roles the caller wants saved, including —
unchanged — the protected ``super_admin`` column. That is the point of the
one-save shape: the UI shows a matrix, the save submits the matrix, and the
service refuses anything that actually changes the protected column or
escapes the caller's own authority (on either the old or the new set).

F036's matrix screen consumes this surface; no route is registered in the
frontend yet (the F034 lesson: a registered route is a rendered link).
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.api.v1.errors import field_error
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.schemas.admin_roles import (
    CreateRoleRequest,
    RoleItem,
    RoleListResponse,
    SaveMatrixRequest,
    UpdateRoleRequest,
)
from app.services import roles as roles_service
from app.services.sessions import SessionContext
from app.services.users import PrivilegeEscalation

router = APIRouter(prefix="/admin/roles")

DOMAIN_ERRORS = (
    roles_service.RoleNotFound,
    roles_service.RoleNameInUse,
    roles_service.RoleInUse,
    roles_service.SystemRoleProtected,
    roles_service.UnknownPermissionCodes,
    roles_service.MatrixViolation,
    PrivilegeEscalation,
)


def _to_http(exc: Exception) -> HTTPException:
    """The translation table: service rule → status (the F033 dialect).

    *Guard* 403s stay generic (F031); the *rule* 403s carry the reason. Matrix
    violations and unknown codes are 422 with the dotted path
    (`roles.2.permission_codes`) the form layer maps onto the offending cell.
    """
    if isinstance(exc, roles_service.RoleNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")
    if isinstance(exc, roles_service.RoleNameInUse):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A role with this name already exists.",
        )
    if isinstance(exc, roles_service.RoleInUse):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This role is assigned to users and cannot be deleted. Remove it from them first."
            ),
        )
    if isinstance(exc, roles_service.SystemRoleProtected):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The super-admin role is managed by the seed and cannot be changed.",
        )
    if isinstance(exc, roles_service.UnknownPermissionCodes):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error("permission_codes", str(exc))],
        )
    if isinstance(exc, roles_service.MatrixViolation):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error(f"roles.{exc.index}.{exc.field}", exc.message)],
        )
    if isinstance(exc, PrivilegeEscalation):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot manage grants that include permissions you do not hold.",
        )
    raise exc


@router.get(
    "",
    response_model=RoleListResponse,
    summary="List the role catalogue",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the roles.read permission."},
    },
)
async def list_roles(
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.ROLES_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleListResponse:
    """Every role with its grant codes, sorted by name — the picker's options,
    the management list, and the matrix's columns all read this one answer."""
    roles = await roles_service.list_roles(session)
    return RoleListResponse(items=[RoleItem.from_role(role) for role in roles])


@router.post(
    "",
    response_model=RoleItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a role",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing roles.manage, or an escalation beyond the caller's codes."},
        409: {"description": "A role with this name already exists."},
        422: {"description": "Shape errors or unknown permission codes."},
    },
)
async def create_role(
    payload: CreateRoleRequest,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.ROLES_MANAGE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleItem:
    try:
        role = await roles_service.create_role(
            session,
            actor=context.user,
            name=payload.name,
            description=payload.description,
            permission_codes=payload.permission_codes,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return RoleItem.from_role(role)


@router.get(
    "/{role_id}",
    response_model=RoleItem,
    summary="One role",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the roles.read permission."},
        404: {"description": "No such role."},
    },
)
async def get_role(
    role_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.ROLES_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleItem:
    try:
        role = await roles_service.get_role(session, role_id)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return RoleItem.from_role(role)


@router.patch(
    "/{role_id}",
    response_model=RoleItem,
    summary="Rename or re-describe a role",
    responses={
        400: {"description": "An empty edit (no fields set)."},
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing roles.manage, or the seed-owned super-admin role."},
        404: {"description": "No such role."},
        409: {"description": "A role with this name already exists."},
    },
)
async def update_role(
    role_id: uuid.UUID,
    payload: UpdateRoleRequest,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.ROLES_MANAGE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleItem:
    changes: dict[str, Any] = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No changes were submitted.",
        )
    try:
        target = await roles_service.get_role(session, role_id)
        updated = await roles_service.update_role(
            session, actor=context.user, target=target, changes=changes
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return RoleItem.from_role(updated)


@router.delete(
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an unassigned role",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing roles.manage, or the seed-owned super-admin role."},
        404: {"description": "No such role."},
        409: {"description": "The role is assigned to users."},
    },
)
async def delete_role(
    role_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.ROLES_MANAGE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        target = await roles_service.get_role(session, role_id)
        await roles_service.delete_role(session, actor=context.user, target=target)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc


@router.put(
    "/matrix",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Save the permission matrix atomically",
    responses={
        401: {"description": "No usable session was presented."},
        403: {
            "description": (
                "Missing roles.manage, a change to the seed-owned super-admin "
                "role, or an edit escaping the caller's own codes."
            )
        },
        422: {
            "description": (
                "Field-addressable per entry: roles.<i>.role_id / roles.<i>.permission_codes."
            ),
        },
    },
)
async def save_matrix(
    payload: SaveMatrixRequest,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.ROLES_MANAGE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Replace every listed role's grant set in **one transaction**.

    Validated before the first write; committed once. There is no ordering of
    the payload that can leave half the matrix saved, which is the whole
    difference from the reference's per-cell PATCH loop (BP-7.4)."""
    try:
        await roles_service.save_matrix(
            session,
            actor=context.user,
            entries=[(entry.role_id, entry.permission_codes) for entry in payload.roles],
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
