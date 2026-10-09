"""Admin application settings (F039, BP-7.5).

Two endpoints: the snapshot under ``settings.read`` and the guarded write
under ``settings.manage``. The write accepts a bare map of registry keys —
the allowlist check happens before anything is stored, so the API's attack
surface is exactly ``app/core/settings_registry.py``, and a refused key or
value answers as a field-addressable 422 at that key (see
``app/schemas/admin_settings.py`` for why the body is the map itself).

Secrets are not in scope here by design (BP-7.5): the DB holds display
preferences; credentials live in the environment.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.api.v1.errors import field_error
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.schemas.admin_settings import SettingsResponse
from app.services import settings as settings_service
from app.services.sessions import SessionContext

router = APIRouter(prefix="/admin/settings")


@router.get(
    "",
    response_model=SettingsResponse,
    summary="Read the effective application settings",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the settings.read permission."},
    },
)
async def get_settings_endpoint(
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.SETTINGS_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SettingsResponse:
    """Every declared key: its stored override, or the registry's default."""
    return SettingsResponse(values=await settings_service.get_settings_snapshot(session))


@router.put(
    "",
    response_model=SettingsResponse,
    summary="Update application settings",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing settings.manage."},
        422: {"description": "Field-addressable: `loc` names the offending setting key."},
    },
)
async def update_settings_endpoint(
    payload: dict[str, Any],
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.SETTINGS_MANAGE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SettingsResponse:
    """Validate every key before the first write, then upsert in one commit;
    the response is the fresh snapshot, so no follow-up GET is needed."""
    try:
        values = await settings_service.update_settings(session, actor=context.user, values=payload)
    except settings_service.UnknownSetting as unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error(unknown.key, f"Unknown setting: `{unknown.key}`.")],
        ) from unknown
    except settings_service.InvalidSettingValue as invalid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error(invalid.key, invalid.message)],
        ) from invalid
    return SettingsResponse(values=values)
