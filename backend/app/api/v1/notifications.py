"""The signed-in user's inbox (F045, §7.7's API half).

Six endpoints over `app/services/notifications.py`; the split of codes is
C16's: reading the inbox needs ``notifications.read``, changing it (read
marks, deletes) needs ``notifications.manage_own`` — which every seeded role
holds, because an inbox is self-service. Both are scoped in SQL to the
session's user (F041's structural isolation): the ids in the paths are never
looked up without the user filter, so another account's notice is **not
found** (404), never *forbidden* (a 403 would confirm the id exists).

All six ride the gated ``current_session`` — they are regular endpoints; a
forced password change outranks an inbox (C30's rule, applied again).
Producers do not come through here: notifications are written by the services
that cause them (``notify``, inside their transaction — F043's discipline),
and no create route exists to be a spam relay.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.schemas.notifications import (
    ClearAllResponse,
    MarkAllReadResponse,
    NotificationItem,
    NotificationListResponse,
    UnreadCountResponse,
)
from app.services import notifications as notifications_service
from app.services.notifications import NotificationNotFound
from app.services.sessions import SessionContext

router = APIRouter(prefix="/notifications")


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List your notifications",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing notifications.read or a pending password change."},
    },
)
async def list_notifications(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.NOTIFICATIONS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> NotificationListResponse:
    """Newest first, with the unread count alongside — the bell and the page
    in one answer."""
    rows, total, unread = await notifications_service.list_notifications(
        session, context.user.id, page=page, page_size=page_size
    )
    return NotificationListResponse(
        items=[NotificationItem.model_validate(row) for row in rows],
        total=total,
        unread_count=unread,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
    summary="Your unread notification count",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing notifications.read or a pending password change."},
    },
)
async def unread_count(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.NOTIFICATIONS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UnreadCountResponse:
    """The cheap endpoint F046's bell polls (~30 s)."""
    return UnreadCountResponse(
        unread_count=await notifications_service.unread_count(session, context.user.id)
    )


@router.post(
    "/{notification_id}/read",
    response_model=NotificationItem,
    summary="Mark one notification read",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing notifications.manage_own or a pending password change."},
        404: {"description": "No such notification belongs to the caller."},
    },
)
async def mark_read(
    notification_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.NOTIFICATIONS_MANAGE_OWN))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> NotificationItem:
    try:
        row = await notifications_service.mark_read(
            session, user_id=context.user.id, notification_id=notification_id
        )
    except NotificationNotFound as missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found."
        ) from missing
    return NotificationItem.model_validate(row)


@router.post(
    "/read-all",
    response_model=MarkAllReadResponse,
    summary="Mark every notification read",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing notifications.manage_own or a pending password change."},
    },
)
async def mark_all_read(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.NOTIFICATIONS_MANAGE_OWN))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MarkAllReadResponse:
    updated = await notifications_service.mark_all_read(session, context.user.id)
    return MarkAllReadResponse(updated=updated)


@router.delete(
    "/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete one notification",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing notifications.manage_own or a pending password change."},
        404: {"description": "No such notification belongs to the caller."},
    },
)
async def delete_notification(
    notification_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.NOTIFICATIONS_MANAGE_OWN))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        await notifications_service.delete_notification(
            session, user_id=context.user.id, notification_id=notification_id
        )
    except NotificationNotFound as missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found."
        ) from missing


@router.delete(
    "",
    response_model=ClearAllResponse,
    summary="Clear your whole inbox",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing notifications.manage_own or a pending password change."},
    },
)
async def clear_all(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.NOTIFICATIONS_MANAGE_OWN))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ClearAllResponse:
    deleted = await notifications_service.clear_all(session, context.user.id)
    return ClearAllResponse(deleted=deleted)
