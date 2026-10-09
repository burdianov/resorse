"""Authentication endpoints (F028 opens the surface with login).

The endpoint is deliberately thin: the service (``app/services/auth.py``)
decides, this layer translates. Three outcomes exist, and only three:

- **200** — a session was issued; the two cookies are set here.
- **401** — one message (:data:`INVALID_CREDENTIALS_DETAIL`) for *every* way
  credentials can fail, from an unknown email to a deactivated account
  (BP-6.2g: login failures must not enumerate users).
- **429** — one message (:data:`RATE_LIMITED_DETAIL`) for both throttles, with
  ``Retry-After``. The same body answers whether or not the account exists,
  because the throttle engages for both.

422 is reserved for a structurally invalid body (missing field, absurd
lengths), which reveals nothing about any account.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.schemas.auth import AuthenticatedUser, LoginRequest, LoginResponse
from app.services.auth import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    InvalidCredentials,
    LoginRateLimited,
    log_in,
)

router = APIRouter(prefix="/auth")

INVALID_CREDENTIALS_DETAIL = "Invalid email or password."
RATE_LIMITED_DETAIL = "Too many login attempts. Try again later."


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

    # No Max-Age/Expires: a browser-session cookie. The row's deadlines are
    # authoritative either way (the request dependency enforces them), so the
    # cookie's client-side lifetime adds nothing — and a cookie that outlives
    # the row would only produce 401s that the frontend already handles.
    #
    # `secure=True` even in development: browsers treat http://localhost as a
    # secure context, and the `__Host-` prefix requires the attribute.
    response.set_cookie(
        SESSION_COOKIE_NAME,
        issued.token,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    # Readable by design (double-submit): F029 compares this value against the
    # X-CSRF-Token header on unsafe methods.
    response.set_cookie(
        CSRF_COOKIE_NAME,
        issued.csrf_token,
        httponly=False,
        secure=True,
        samesite="lax",
        path="/",
    )
    return LoginResponse(user=AuthenticatedUser.model_validate(issued.user))
