"""Writing the audit trail: one function, called inside the mutation (F043).

The contract is short and load-bearing:

- ``record`` **adds** a row to the caller's session. It never commits. The
  mutation's own commit carries the event, so the two are one unit of work —
  a failed mutation leaves no event, and an event cannot exist without its
  change (the acceptance's atomicity, made structural rather than promised).
- ``details`` is **validated, not trusted**: blocked keys (password- and
  token-shaped, matched case-insensitively) anywhere in the structure raise
  before the row is added, so a caller that tries to log a credential fails
  its own transaction instead of leaking into the one table that must never
  hold a secret. Callers still write minimal diffs — the blocklist is the
  floor, not the style.
- ``correlation_id`` comes from the request contextvar when there is a
  request, and is NULL otherwise ("no request" is a fact, not a gap).

The vocabulary (``AUDIT_ACTIONS`` / ``AUDIT_ENTITY_TYPES``) lives on the
model with database CHECKs; this module validates against the same constants
at the door, so a typo is an error where it happens rather than an
IntegrityError at commit time.
"""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import get_request_id
from app.models.audit import AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AuditLog
from app.models.identity import User

# Credential-shaped keys that must never reach the trail, matched
# case-insensitively against every dict key in `details`, recursively.
BLOCKED_DETAIL_KEYS = frozenset(
    {
        "password",
        "new_password",
        "current_password",
        "confirm_password",
        "hashed_password",
        "password_hash",
        "temporary_password",
        "token",
        "token_hash",
        "csrf_token",
        "secret",
    }
)

MAX_SUMMARY_LENGTH = 500


class InvalidAuditEvent(Exception):
    """The event itself is malformed (unknown action/entity, blocked key)."""


def _screen(details: Any) -> None:
    if isinstance(details, dict):
        for key, value in details.items():
            if str(key).lower() in BLOCKED_DETAIL_KEYS:
                raise InvalidAuditEvent(
                    f"Audit details may not carry credential-shaped keys (got `{key}`)."
                )
            _screen(value)
    elif isinstance(details, list | tuple):
        for item in details:
            _screen(item)


async def record(
    session: AsyncSession,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    summary: str,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    """Add one event to the caller's transaction. See the module docstring."""
    if action not in AUDIT_ACTIONS:
        raise InvalidAuditEvent(f"Unknown audit action: `{action}`.")
    if entity_type not in AUDIT_ENTITY_TYPES:
        raise InvalidAuditEvent(f"Unknown audit entity type: `{entity_type}`.")
    summary = summary.strip()
    if not summary or len(summary) > MAX_SUMMARY_LENGTH:
        raise InvalidAuditEvent(
            f"An audit summary is 1–{MAX_SUMMARY_LENGTH} characters of trimmed text."
        )
    if details is not None:
        _screen(details)

    entry = AuditLog(
        user_id=actor.id if actor is not None else None,
        actor_email=actor.email if actor is not None else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        details=details,
        correlation_id=get_request_id(),
    )
    session.add(entry)
    return entry
