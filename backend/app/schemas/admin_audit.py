"""Audit-trail read shapes (F044).

One item shape, one list response. The item carries everything the viewer
needs — including `details`, the sanitized diff F043 stored — so the detail
modal renders from the row the list already returned: no second request, no
`GET /{id}` endpoint that would exist only to re-fetch what was just sent.

The list response also carries the **vocabulary** (`actions`, `entity_types`)
that F043 keeps on the model. The filter options therefore come from the
server's own constants rather than a hand-kept client copy that could drift
the first time an action is added (C33) — the same instinct as the frontend
permission registry, applied to a smaller surface.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.models.audit import AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AuditLog


class AuditItem(BaseModel):
    id: UUID
    created_at: datetime
    # Live link (NULL once the account is deleted) and the frozen snapshot.
    user_id: UUID | None
    actor_email: str | None
    action: str
    entity_type: str
    entity_id: UUID | None
    summary: str
    details: dict[str, Any] | None
    correlation_id: str | None

    @classmethod
    def from_log(cls, row: AuditLog) -> AuditItem:
        return cls(
            id=row.id,
            created_at=row.created_at,
            user_id=row.user_id,
            actor_email=row.actor_email,
            action=row.action,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            summary=row.summary,
            details=row.details,
            correlation_id=row.correlation_id,
        )


class AuditListResponse(BaseModel):
    """One page of the trail, newest first, plus the filter vocabulary."""

    items: list[AuditItem]
    total: int
    page: int
    page_size: int
    actions: list[str] = list(AUDIT_ACTIONS)
    entity_types: list[str] = list(AUDIT_ENTITY_TYPES)
