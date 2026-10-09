"""Request-level authentication and authorization dependencies (F029, F031).

One resolution, four faces, and the *defaulting* is the design:

- ``optional_session`` — the raw cookie resolution; ``None`` is a possible
  answer (logout is idempotent and quiet about it).
- ``authenticated_session`` — the same, or 401. The credentials-only gate:
  it answers *who*, not *may they act yet*. Only the auth endpoints that must
  keep working during a forced password change use it (see below).
- ``current_session`` — ``authenticated_session`` plus the forced-change gate:
  403 while ``must_change_password`` is set (BIG-PROMPT §6.1e: "the API
  should enforce `must_change_password` for all regular endpoints"). **This
  is the default** a new endpoint should reach for: an author who never
  thinks about the flag still gets the gate, and an exemption has to be
  typed on purpose (the fail-closed shape this codebase prefers).
- ``require_permission(code)`` — ``current_session`` plus the effective-
  permission check against ``app/core/permissions.effective_permissions``.
  One code per dependency: the narrowest grant is what an endpoint should
  name; "any of several codes" can layer dependencies if a future screen
  genuinely needs it.

The forced-change exemption list is exactly the auth router, and each entry
has a reason: ``logout``/``logout-all`` (you may always end sessions,
especially the one you cannot use), ``change-password`` (it *is* the change),
``/auth/me`` (the SPA reads the flag from it to route to the forced-change
screen). Everything else — every present and future regular endpoint — rides
on ``current_session``.

Refusals: 401 for "no usable session" (one message for every cause, the
login's anti-enumeration instinct); 403 for "session is fine, the request is
not allowed" — one message for permission denial, one for the pending
password change, so the frontend can key its routing on ``/auth/me``'s flag
while the 403 remains the server-side backstop.
"""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import SESSION_COOKIE_NAME
from app.core.database import get_session
from app.core.permissions import PermissionCode, effective_permissions
from app.services.sessions import SessionContext, resolve_session

NOT_AUTHENTICATED_DETAIL = "Not authenticated."
PASSWORD_CHANGE_REQUIRED_DETAIL = "Your password must be changed before continuing."
PERMISSION_DENIED_DETAIL = "You do not have permission to perform this action."


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


async def authenticated_session(
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


async def current_session(
    context: Annotated[SessionContext, Depends(authenticated_session)],
) -> SessionContext:
    """``authenticated_session``, gated on the forced password change.

    The check reads the flag the resolution just loaded from the database —
    no extra query, and no cache: F030 clears the flag in the same commit
    that rotates the session, so the very next request passes.
    """
    if context.user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PASSWORD_CHANGE_REQUIRED_DETAIL,
        )
    return context


def require_permission(code: PermissionCode) -> Callable[..., Awaitable[SessionContext]]:
    """Build the dependency that demands one permission code.

    ``code`` is a ``PermissionCode`` member, not a string: a typo is an
    ``AttributeError`` at import, and the vocabulary stays the one machine
    copy F027 seeded (a permission code invented in a route would be exactly
    the almost-match this project designs against).

    The check re-reads nothing: ``current_session``'s resolution already
    loaded the user *with* roles and permissions from the database this
    request (F024's ``selectin`` note), so the union is computed per request
    and a role change applies on the next one (BP-6.3f) — no cache to
    invalidate, and no stale privilege to reason about.
    """

    async def guard(
        context: Annotated[SessionContext, Depends(current_session)],
    ) -> SessionContext:
        if code not in effective_permissions(context.user):
            # One generic message: the permission model is not secret (the
            # SPA's registry mirrors it), but an error body is not the place
            # to narrate an account's authority either.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=PERMISSION_DENIED_DETAIL,
            )
        return context

    return guard
