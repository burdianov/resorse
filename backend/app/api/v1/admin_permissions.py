"""Admin permission dictionary (F036's read slice; F037 extends this router).

One endpoint: the code catalogue the matrix's rows and any dictionary table
render from. Guarded by ``permissions.read`` — the seeded ``admin`` holds it
(everything except the two ``.manage`` codes, C16).

F037 adds the create/edit/delete guardrails here (``permissions.manage``,
"refuse deleting permissions still in use or require explicit safe
resolution" — BP-7.4); the guard, the shape and the sort order are this
file's precedent.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.models.identity import Permission
from app.schemas.admin_permissions import PermissionItem, PermissionListResponse
from app.services.sessions import SessionContext

router = APIRouter(prefix="/admin/permissions")


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
    permissions = await session.scalars(select(Permission).order_by(Permission.code.asc()))
    return PermissionListResponse(
        items=[PermissionItem.model_validate(permission) for permission in permissions]
    )
