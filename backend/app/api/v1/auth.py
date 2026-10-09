"""Authentication endpoints (F028 login; F029 logout; F030 change-password;
F031 /auth/me).

The endpoint layer is deliberately thin: the services
(``app/services/auth.py``, ``app/services/sessions.py``,
``app/services/passwords.py``) decide, this layer translates. For login,
three outcomes exist and only three:

- **200** — a session was issued; the two cookies are set here.
- **401** — one message (:data:`INVALID_CREDENTIALS_DETAIL`) for *every* way
  credentials can fail, from an unknown email to a deactivated account
  (BP-6.2g: login failures must not enumerate users).
- **429** — one message (:data:`RATE_LIMITED_DETAIL`) for both throttles, with
  ``Retry-After``. The same body answers whether or not the account exists,
  because the throttle engages for both.

422 is reserved for a structurally invalid body (missing field, absurd
lengths), which reveals nothing about any account.

Logout is the opposite shape on purpose: **204, always.** Its goal state is
"no session", which an expired row or a junk cookie already satisfies, so
there is no failure case to report — and nothing to report it to. The full
resolution still runs (F029), so replaying a *superseded* ID through logout
triggers the same family revocation as anywhere else.

Every unsafe endpoint here sits behind F029's CSRF middleware
(``app/core/csrf.py``): a request carrying the session cookie must pass the
origin check and present ``X-CSRF-Token`` matching the ``__Host-csrf`` cookie.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

# Every endpoint here uses ``authenticated_session``, never the gated
# ``current_session``: this router *is* the exemption list (logout must always
# be possible, the change-password endpoint is the forced change itself, and
# ``/auth/me`` is how the SPA learns the flag is set). Regular endpoints get
# the gate by default — see ``app/api/v1/dependencies.py``.
from app.api.v1.dependencies import authenticated_session, optional_session
from app.core.cookies import clear_session_cookies, set_session_cookies
from app.core.database import get_session
from app.core.permissions import effective_permissions
from app.schemas.auth import (
    AuthenticatedUser,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
)
from app.services.auth import InvalidCredentials, LoginRateLimited, log_in
from app.services.passwords import (
    InvalidCurrentPassword,
    PasswordPolicyViolation,
    PasswordRateLimited,
)
from app.services.passwords import change_password as change_password_service
from app.services.sessions import SessionContext, log_out, log_out_all

router = APIRouter(prefix="/auth")

INVALID_CREDENTIALS_DETAIL = "Invalid email or password."
RATE_LIMITED_DETAIL = "Too many login attempts. Try again later."
PASSWORD_RATE_LIMITED_DETAIL = "Too many password attempts. Try again later."


def _field_error(field: str, message: str) -> dict[str, object]:
    """One Pydantic-shaped 422 entry — deliberately without ``input``.

    Pydantic's own validation errors echo the offending value in ``input``;
    for credential fields that value is a password, and a response body is
    the last place it belongs. ``loc``/``msg``/``type`` is everything the
    frontend's field mapper reads (``frontend/src/lib/errors.ts``), so
    omitting ``input`` changes nothing for the client and everything for
    "never echo a credential".
    """
    return {"type": "value_error", "loc": ["body", field], "msg": message}


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Sign in and start a session",
    responses={
        401: {"description": "Invalid credentials (never says which part)."},
        429: {"description": "Login throttled; see Retry-After."},
    },
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LoginResponse:
    # The throttling address is the transport's view of the peer. Proxy
    # headers (`X-Forwarded-For`) are deliberately not consulted: without a
    # known proxy they are client-controlled, and trusting them would let one
    # caller mint a fresh bucket per request. Validated proxy trust is
    # deployment configuration (F060).
    client_ip = request.client.host if request.client else "unknown"

    try:
        issued = await log_in(
            session,
            email=payload.email,
            password=payload.password,
            client_ip=client_ip,
        )
    except LoginRateLimited as limited:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=RATE_LIMITED_DETAIL,
            headers={"Retry-After": str(limited.retry_after_seconds)},
        ) from limited
    except InvalidCredentials as invalid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS_DETAIL,
        ) from invalid

    # The cookie contract (names, attributes) lives in app/core/cookies.py:
    # logout and rotation must set and clear the exact same spellings.
    set_session_cookies(response, token=issued.token, csrf_token=issued.csrf_token)
    return LoginResponse(user=AuthenticatedUser.model_validate(issued.user))


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="End the current session",
    responses={
        403: {"description": "CSRF check failed (see docs/ARCHITECTURE.md §3)."},
    },
)
async def logout(
    context: Annotated[SessionContext | None, Depends(optional_session)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """End the session this request presented, and clear both cookies.

    Idempotent: no cookie, a junk cookie, an already-ended session — the
    answer is the same 204 and the cookies still leave the browser. The
    resolution that produced ``context`` is the full one, so a *rotated*
    ID presented here trips the same family revocation as anywhere else; a
    stale tab is not a loophole, and neither is a thief.
    """
    if context is not None:
        await log_out(session, context)

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookies(response)
    return response


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Change the signed-in user's password",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "CSRF check failed (see docs/ARCHITECTURE.md §3)."},
        422: {
            "description": (
                "Field-addressable (loc = body/current_password or "
                "body/new_password); no input value is echoed."
            ),
        },
        429: {"description": "Too many failed current-password attempts; see Retry-After."},
    },
)
async def change_password(
    payload: ChangePasswordRequest,
    context: Annotated[SessionContext, Depends(authenticated_session)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Change the caller's own password — the forced first-login flow and
    Profile > Security are the same request.

    204 with a **fresh cookie pair**: the session that asked is rotated (a
    new ID, same family), every *other* session of the account is revoked
    (``password_change``), and ``must_change_password`` clears — one commit
    in the service. Refusals are field-addressable 422s (wrong current
    password, policy violations, new equals current); a wrong current
    password is deliberately *not* a 401, which this API reserves for "your
    session is over" — a typo must not sign the user out. The current
    password is itself throttled (its own bucket, 429 with ``Retry-After``),
    because a stolen session must not become a password oracle.
    """
    try:
        issued = await change_password_service(
            session,
            context,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except PasswordRateLimited as limited:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=PASSWORD_RATE_LIMITED_DETAIL,
            headers={"Retry-After": str(limited.retry_after_seconds)},
        ) from limited
    except InvalidCurrentPassword as invalid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[_field_error("current_password", "Current password is incorrect.")],
        ) from invalid
    except PasswordPolicyViolation as violation:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[_field_error("new_password", message) for message in violation.violations],
        ) from violation

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    set_session_cookies(response, token=issued.token, csrf_token=issued.csrf_token)
    return response


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="End every session of the signed-in user",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "CSRF check failed (see docs/ARCHITECTURE.md §3)."},
    },
)
async def logout_all(
    context: Annotated[SessionContext, Depends(authenticated_session)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Revoke every live session of the caller's account, this one included.

    Distinct from logout in the one way that matters: it acts under a session
    (401 without one), so it can revoke "all *my other* sessions" — the
    response to "someone may have my credentials". One bulk UPDATE; the
    family link is irrelevant here, because every family dies.
    """
    await log_out_all(session, user_id=context.user.id)

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookies(response)
    return response


@router.get(
    "/me",
    response_model=MeResponse,
    summary="The signed-in user and their effective permissions",
    responses={
        401: {"description": "No usable session was presented."},
    },
)
async def me(
    context: Annotated[SessionContext, Depends(authenticated_session)],
) -> MeResponse:
    """Who the caller is, and what the database says they may do — right now.

    The answer is computed from this request's resolution of the session,
    roles and permissions (F029 re-loads the graph every request), so a role
    change made a second ago is already reflected and a revoked one is gone
    (BP-6.3f: no cache to invalidate). Deliberately reachable during a forced
    password change — this is how the SPA learns the flag is set and where to
    route — which is also why it does not ride the gated ``current_session``.

    The permission list is the expanded union, superusers included (every
    code, never a wildcard): the frontend checks set membership and never
    special-cases a flag (ARCHITECTURE §6 layer 3 — UX mirroring the server's
    real answer).
    """
    user = context.user
    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        must_change_password=user.must_change_password,
        phone=user.phone,
        is_superuser=user.is_superuser,
        roles=sorted(role.name for role in user.roles),
        permissions=sorted(effective_permissions(user)),
    )
