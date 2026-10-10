"""Notifications: the inbox's rules (F045).

Two audiences, one table:

- **Producers** call :func:`notify` — which *adds* a row to the caller's
  session and never commits, so the notification rides the transaction of
  the event it announces (the F043 discipline: no orphan notices, no notices
  for changes that rolled back). There is deliberately no public create
  endpoint: "notify myself about things I did" is not a feature, and a
  create route would be a spam relay for one's own inbox.
- **Readers** are the HTTP endpoints: list (with the unread count the bell
  polls), mark one read, mark all read, delete one, clear all. Every
  function takes the **user id from the session** and filters by it in SQL —
  the F041 structural-isolation pattern, applied to the acceptance's
  "cross-user denial tests": there is no parameter through which another
  user's id could arrive.

A row the caller cannot see does not exist *for them*: marking or deleting a
foreign (or stale) id is a 404 raised here, not a 403 — a 403 would confirm
that the id exists. The SQL filter is (id AND user_id) together, so the
distinction never reaches the database either.

The link rule (path, first char alphanumeric, at most 500 chars) is validated
here at the door and pinned by the table's CHECK — see the model docstring
for why an inbox must never store a URL.
"""

import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notifications import (
    MAX_LINK_LENGTH,
    MAX_MESSAGE_LENGTH,
    MAX_TITLE_LENGTH,
    Notification,
)

_LINK_HEAD = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")


class InvalidNotification(Exception):
    """The notice itself is malformed (empty title/message, an unsafe link)."""


class NotificationNotFound(Exception):
    """No notification with this id belongs to this user."""


def _cleaned_link(link: str | None) -> str | None:
    if link is None:
        return None
    cleaned = link.strip()
    if (
        len(cleaned) > MAX_LINK_LENGTH
        or len(cleaned) < 2
        or cleaned[0] != "/"
        or cleaned[1] not in _LINK_HEAD
    ):
        raise InvalidNotification(
            "A notification link must be an internal path like `/dashboard` "
            "(never a URL, never protocol-relative).",
        )
    return cleaned


async def notify(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    title: str,
    message: str,
    link: str | None = None,
) -> Notification:
    """Add one notice to the caller's transaction. Producers only — see the
    module docstring."""
    title = title.strip()
    message = message.strip()
    if not title or len(title) > MAX_TITLE_LENGTH:
        raise InvalidNotification(f"A notification title is 1–{MAX_TITLE_LENGTH} characters.")
    if not message or len(message) > MAX_MESSAGE_LENGTH:
        raise InvalidNotification(f"A notification message is 1–{MAX_MESSAGE_LENGTH} characters.")
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        link=_cleaned_link(link),
    )
    session.add(notification)
    return notification


async def list_notifications(
    session: AsyncSession, user_id: uuid.UUID, *, page: int, page_size: int
) -> tuple[list[Notification], int, int]:
    """One page of the caller's inbox (newest first), its total, and the
    unread count — the bell and the list in one request."""
    criteria = (Notification.user_id == user_id,)
    total = await session.scalar(select(func.count()).select_from(Notification).where(*criteria))
    unread = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(*criteria, Notification.is_read.is_(False))
    )
    rows = await session.scalars(
        select(Notification)
        .where(*criteria)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return list(rows), int(total or 0), int(unread or 0)


async def unread_count(session: AsyncSession, user_id: uuid.UUID) -> int:
    """The cheap answer for the bell's polling (F046, ~30s)."""
    count = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
    )
    return int(count or 0)


async def mark_read(
    session: AsyncSession, *, user_id: uuid.UUID, notification_id: uuid.UUID
) -> Notification:
    """Flip one notice to read and commit. Idempotent for the owner —
    re-reading a read notice is the goal state already held."""
    row = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user_id
        )
    )
    if row is None:
        raise NotificationNotFound
    row.is_read = True
    await session.commit()
    await session.refresh(row)
    return row


async def mark_all_read(session: AsyncSession, user_id: uuid.UUID) -> int:
    """Mark every unread notice of the caller read; returns how many."""
    changed = (
        await session.scalars(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True)
            .returning(Notification.id)
        )
    ).all()
    await session.commit()
    return len(changed)


async def delete_notification(
    session: AsyncSession, *, user_id: uuid.UUID, notification_id: uuid.UUID
) -> None:
    """Delete one notice; 404 when it is not the caller's (see the module
    docstring: the filter is (id AND user_id), so foreign ids are not found,
    never forbidden)."""
    removed = (
        await session.scalars(
            delete(Notification)
            .where(Notification.id == notification_id, Notification.user_id == user_id)
            .returning(Notification.id)
        )
    ).all()
    if not removed:
        raise NotificationNotFound
    await session.commit()


async def clear_all(session: AsyncSession, user_id: uuid.UUID) -> int:
    """Delete the caller's whole inbox; returns how many rows went."""
    removed = (
        await session.scalars(
            delete(Notification).where(Notification.user_id == user_id).returning(Notification.id)
        )
    ).all()
    await session.commit()
    return len(removed)
