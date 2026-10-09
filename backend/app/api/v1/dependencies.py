"""Request-level authentication dependencies (F029) — what F030/F031 build on.

One job: turn the session cookie into a :class:`SessionContext` or refuse.
Every decision lives in ``app/services/sessions.py``; what belongs here is the
one HTTP-shaped outcome — a 401 with a stable message — and the cookie read.

Two dependencies, one resolution. ``optional_session`` is for the endpoints
that are idempotent and quiet by design (logout answers 204 even when there
was nothing to end), so it wants ``None`` rather than an exception;
``current_session`` is the ordinary "this endpoint acts as somebody" gate.
FastAPI caches per-request dependencies, so the second is a type-and-status
wrapper around the first — the lookup runs once either way.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import SESSION_COOKIE_NAME
from app.core.database import get_session
from app.services.sessions import SessionContext, resolve_session

NOT_AUTHENTICATED_DETAIL = "Not authenticated."


async def optional_session(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SessionContext | None:
    """The presented session, or ``None``. Resolution includes replay
    detection, so even a "there was nothing to end" answer may have revoked a
    family on the way through."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    return await resolve_session(session, token)


async def current_session(
    context: Annotated[SessionContext | None, Depends(optional_session)],
) -> SessionContext:
    """The presented session, or 401 with one message for every failure.

    The message is deliberately blind to the cause (unknown, expired,
    superseded, deactivated) — the same anti-enumeration instinct as login's
    uniform refusal (BP-6.2g): an attacker with a cookie learns "not a usable
    credential", nothing more.
    """
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=NOT_AUTHENTICATED_DETAIL,
        )
    return context
