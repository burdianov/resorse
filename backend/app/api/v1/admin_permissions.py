"""Admin permission dictionary (F036's read slice; F037 completes the surface).

The dictionary's list (F036, for the matrix's rows) plus its CRUD guardrails
(F037, C26): create under `permissions.manage` — the code the seeded `admin`
deliberately lacks (C16) — description edits anywhere, and **code renames or
deletions only while no role holds the code** (409 with the assignment count
otherwise; a live grant means "the code as it reads", so changing the spelling
or removing the row would silently rewrite authority).

The rules live in ``app/services/permissions.py``; this file translates —
the same two-dialect scheme as F033/F035 (guard 403s generic, rule refusals
worded).
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.schemas.admin_permissions import (
    CreatePermissionRequest,
    PermissionItem,
    PermissionListResponse,
    UpdatePermissionRequest,
)
from app.services import permissions as permissions_service
from app.services.sessions import SessionContext

router = APIRouter(prefix="/admin/permissions")

DOMAIN_ERRORS = (
    permissions_service.PermissionNotFound,
    permissions_service.PermissionCodeTaken,
    permissions_service.PermissionInUse,
)


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, permissions_service.PermissionNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found.")
    if isinstance(exc, permissions_service.PermissionCodeTaken):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A permission with this code already exists.",
        )
    if isinstance(exc, permissions_service.PermissionInUse):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This permission is granted to roles and cannot be renamed or deleted "
                "while it is. Remove it from them first."
            ),
        )
    raise exc


@router.get(
    "",
    response_model=PermissionListResponse,
    summary="List the permission dictionary",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the permissions.read permission."},
    },
)
async def list_permissions(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.PERMISSIONS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PermissionListResponse:
    """Every code with its description, sorted — namespace grouping is the
    client's presentation concern, the sort order is the contract."""
    permissions = await permissions_service.list_permissions(session)
    return PermissionListResponse(
        items=[PermissionItem.model_validate(permission) for permission in permissions]
    )


@router.post(
    "",
    response_model=PermissionItem,
    status_code=status.HTTP_201_CREATED,
    summary="Add a permission code",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing permissions.manage."},
        409: {"description": "A permission with this code already exists."},
        422: {"description": "The code is not lowercase `resource.action`."},
    },
)
async def create_permission(
    payload: CreatePermissionRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.PERMISSIONS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PermissionItem:
    """A new code confers nothing until a role is granted it through the
    matrix save, which enforces the escalation rule (C26) — this endpoint
    needs none of its own."""
    try:
        permission = await permissions_service.create_permission(
            session, code=payload.code, description=payload.description
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return PermissionItem.model_validate(permission)


@router.get(
    "/{permission_id}",
    response_model=PermissionItem,
    summary="One permission code",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing permissions.read."},
        404: {"description": "No such permission."},
    },
)
async def get_permission(
    permission_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.PERMISSIONS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PermissionItem:
    try:
        permission = await permissions_service.get_permission(session, permission_id)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return PermissionItem.model_validate(permission)


@router.patch(
    "/{permission_id}",
    response_model=PermissionItem,
    summary="Rename or re-describe a permission code",
    responses={
        400: {"description": "An empty edit (no fields set)."},
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing permissions.manage."},
        404: {"description": "No such permission."},
        409: {"description": "The code is taken, or in use and therefore frozen."},
        422: {"description": "The new code is not lowercase `resource.action`."},
    },
)
async def update_permission(
    permission_id: uuid.UUID,
    payload: UpdatePermissionRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.PERMISSIONS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PermissionItem:
    changes: dict[str, Any] = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No changes were submitted.",
        )
    try:
        target = await permissions_service.get_permission(session, permission_id)
        updated = await permissions_service.update_permission(
            session, target=target, changes=changes
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return PermissionItem.model_validate(updated)


@router.delete(
    "/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an unused permission code",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing permissions.manage."},
        404: {"description": "No such permission."},
        409: {"description": "The code is granted to roles and cannot be deleted."},
    },
)
async def delete_permission(
    permission_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.PERMISSIONS_MANAGE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        target = await permissions_service.get_permission(session, permission_id)
        await permissions_service.delete_permission(session, target=target)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
