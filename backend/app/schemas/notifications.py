"""Notification shapes (F045).

The list response carries **the unread count with the page** — the bell and
the inbox in one request (F046's header polls `unread-count` between loads,
which is the only endpoint that exists purely for polling). The item is the
whole notice; there are no write request shapes, because there is no public
create endpoint (see the service's module docstring).
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class NotificationItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    message: str
    # An internal path (never a URL — the model's CHECK and the service's
    # door both refuse anything else).
    link: str | None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationItem]
    total: int
    unread_count: int
    page: int
    page_size: int


class UnreadCountResponse(BaseModel):
    unread_count: int


class MarkAllReadResponse(BaseModel):
    updated: int


class ClearAllResponse(BaseModel):
    deleted: int
