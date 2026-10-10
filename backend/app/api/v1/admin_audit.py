"""The audit trail, read-only (F044, §7.8).

One endpoint and deliberately nothing else: the trail is append-only (F043,
C32), so there is no POST, no PATCH, no DELETE — the viewer cannot mutate
what it displays because no route exists to do so.

`page`/`page_size` follow F033's users list exactly (the F034/C23 server-mode
rules: same page sizes, `total` counted from the same criteria the rows come
from, `id` as the tiebreaker on the fixed `created_at DESC` order — an audit
trail is chronological; there is nothing to sort it *by* other than time).
`search` is an escaped ILIKE over the summary and the actor's frozen email —
"what did grace do" is the query an operator actually has. `action` and
`entity_type` are validated against the model's vocabularies (a 422 names the
allowed values — a filter that silently matches nothing is a lie, C33), and
`since`/`until` bound the timestamps (the viewer's quick periods).
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.models.audit import AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AuditLog
from app.schemas.admin_audit import AuditItem, AuditListResponse
from app.services.sessions import SessionContext

router = APIRouter(prefix="/admin/audit")


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")


@router.get(
    "",
    response_model=AuditListResponse,
    summary="Read the audit trail",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the audit.read permission."},
        422: {"description": "Unknown action/entity filter, or a bad date bound."},
    },
)
async def list_audit(
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.AUDIT_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    search: Annotated[str | None, Query(max_length=100)] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    entity_type: Annotated[str | None, Query(max_length=32)] = None,
    since: Annotated[datetime | None, Query()] = None,
    until: Annotated[datetime | None, Query()] = None,
) -> AuditListResponse:
    criteria = []
    if action is not None:
        if action not in AUDIT_ACTIONS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Unknown audit action `{action}`. Allowed: "
                    + ", ".join(f"`{known}`" for known in AUDIT_ACTIONS)
                    + "."
                ),
            )
        criteria.append(AuditLog.action == action)
    if entity_type is not None:
        if entity_type not in AUDIT_ENTITY_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Unknown audit entity type `{entity_type}`. Allowed: "
                    + ", ".join(f"`{known}`" for known in AUDIT_ENTITY_TYPES)
                    + "."
                ),
            )
        criteria.append(AuditLog.entity_type == entity_type)
    if search:
        pattern = f"%{_escape_like(search.strip())}%"
        criteria.append(or_(AuditLog.summary.ilike(pattern), AuditLog.actor_email.ilike(pattern)))
    if since is not None:
        criteria.append(AuditLog.created_at >= since)
    if until is not None:
        criteria.append(AuditLog.created_at <= until)

    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*criteria))
    rows = await session.scalars(
        select(AuditLog)
        .where(*criteria)
        # Fixed order: chronological means newest first; `id` (uuidv7) breaks
        # ties deterministically for offset pagination.
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return AuditListResponse(
        items=[AuditItem.from_log(row) for row in rows],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )
