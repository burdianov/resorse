"""CSRF enforcement for unsafe methods (F029) — one middleware, impossible to forget.

ARCHITECTURE §3 names three layers: ``SameSite=Lax`` on the cookies (first,
see ``app/core/cookies.py``), mandatory ``Origin``/``Referer`` validation
(second) and a double-submit ``X-CSRF-Token`` header checked against the
readable ``__Host-csrf`` cookie (third). This module is the second and third.
A middleware rather than a per-endpoint dependency, because "every unsafe
endpoint must remember to opt in" is how CSRF protection ends up missing from
exactly the endpoint that needed it; here a new POST is covered before its
author writes it.

The rules, for POST/PUT/PATCH/DELETE only:

1. **A claimed origin must be a known one.** If the request carries ``Origin``
   (or, failing that, ``Referer``), it must reduce to an origin in
   ``Settings.allowed_origins``. Browsers send ``Origin`` on every unsafe
   request, including same-origin ones, so a cross-site caller is refused
   here — and ``Origin: null`` (an opaque origin) reduces to nothing and is
   refused with it. A request that claims **no** origin is a scripted client,
   not a browser: it can send any header it likes anyway, so nothing is gained
   by refusing it, and the double-submit below is what binds cookie-carrying
   requests regardless.
2. **Cookie authority requires the double-submit.** When the request carries
   the ``__Host-session`` cookie, the ``X-CSRF-Token`` header must equal the
   ``__Host-csrf`` cookie's value (constant-time compare; both non-empty). An
   attacker's page cannot read the CSRF cookie cross-origin and cannot attach
   a custom header to a cross-site form post, so it cannot produce the pair —
   which is the point. The one exception is the login endpoint: it
   *establishes* a session rather than acting under one, and a session cookie
   it may still be carrying is a dead one the user cannot even delete
   (HttpOnly, JavaScript cannot remove it). Without the exception, that
   leftover cookie would lock the user out of the login form. Login CSRF
   remains covered by rule 1.
3. **Safe methods are never checked** — they must keep working without any
   precondition.

Refusals are ``403`` with the same ``{"detail": ...}`` shape as every other
error (ARCHITECTURE §10).
"""

import secrets
from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.requests import cookie_parser
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.cookies import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

ORIGIN_DETAIL = "This origin is not allowed to make this request."
TOKEN_DETAIL = "CSRF token missing or invalid."


def origin_of(value: str) -> str | None:
    """Reduce an ``Origin``/``Referer`` header value to ``scheme://host[:port]``.

    ``Origin`` already arrives in that form; ``Referer`` is a full URL of
    which only the origin matters. Anything with no scheme or no host —
    ``null``, garbage — has no origin to compare, so the answer is ``None``
    (and the caller refuses it, exactly like a mismatching origin: it is
    never treated as "absent").
    """
    parts = urlsplit(value)
    if not parts.scheme or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}".lower()


class CsrfMiddleware:
    """The origin + double-submit checks, applied before routing.

    Pure ASGI on purpose (no ``BaseHTTPMiddleware``): the check reads only
    headers, and the pure form keeps the raw request untouched for everything
    downstream — including ``request.client``, which F028's throttling reads.
    ``trusted_origins`` and ``session_exempt_paths`` are constructor
    arguments, so the middleware is a pure function of its configuration.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        trusted_origins: frozenset[str],
        session_exempt_paths: frozenset[str] = frozenset(),
    ) -> None:
        self.app = app
        self._trusted_origins = trusted_origins
        self._session_exempt_paths = session_exempt_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            violation = self._violation(scope)
            if violation is not None:
                response = JSONResponse({"detail": violation}, status_code=403)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)

    def _violation(self, scope: Scope) -> str | None:
        """The detail line for the first failed check, or ``None`` to pass."""
        # ASGI guarantees the method in uppercase.
        if scope["method"] not in UNSAFE_METHODS:
            return None

        headers = Headers(scope=scope)
        claimed = headers.get("origin") or headers.get("referer")
        if claimed and origin_of(claimed) not in self._trusted_origins:
            return ORIGIN_DETAIL

        # The session-establishing carve-out (rule 2 in the module docstring):
        # a session cookie presented *to login* is not ambient authority.
        if scope["path"] in self._session_exempt_paths:
            return None

        cookies = cookie_parser(headers.get("cookie", ""))
        if not cookies.get(SESSION_COOKIE_NAME):
            return None

        provided = headers.get(CSRF_HEADER_NAME)
        expected = cookies.get(CSRF_COOKIE_NAME)
        if not provided or not expected:
            return TOKEN_DETAIL
        # Bytes, not str: `compare_digest` on str raises for non-ASCII input
        # and both values are caller-controlled — a hostile header must earn a
        # 403, not a 500.
        if not secrets.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
            return TOKEN_DETAIL
        return None
