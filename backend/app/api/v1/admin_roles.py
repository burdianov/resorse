"""Admin role catalogue (F034's read slice; F035 extends this router).

One endpoint: the list the user dialogs' role picker reads. Guarded by
``roles.read`` — it *is* the roles catalogue, and the seeded roles all hold
the code; a caller without it gets the generic permission 403 and the picker
renders that failure instead of pretending the catalogue is empty.

F035 adds the CRUD and the atomic permission-matrix save here; the guard, the
shape and the sort order are this file's precedent.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.models.identity import Role
from app.schemas.admin_roles import RoleItem, RoleListResponse
from app.services.sessions import SessionContext

router = APIRouter(prefix="/admin/roles")


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
    """Every role, sorted by name — the picker's options and the future
    management list read the same answer."""
    roles = await session.scalars(select(Role).order_by(Role.name.asc()))
    return RoleListResponse(items=[RoleItem.model_validate(role) for role in roles])
