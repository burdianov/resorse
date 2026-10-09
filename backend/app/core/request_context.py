"""The request id: one string that joins a response, a log line and an audit row (F043).

The middleware reads ``X-Request-Id`` when a client (or an upstream proxy)
supplies a well-formed one, generates a UUID otherwise, exposes it through a
contextvar for anything downstream — F043's audit rows today, F060's
structured logging next — and echoes it on the response in the same header.
The frontend already reads that header (`lib/errors.ts` puts it on every
``ApiError``), so the id an operator sees in a toast is the id the audit row
carries.

A client-supplied id is **accepted but constrained** (``[A-Za-z0-9._-]{1,64}``):
it is echoed into responses and stored in rows, so unbounded or control-
character content would be a header-injection and a log-poisoning vector.
Anything else is replaced by a generated id — the header is a convenience,
never an authority.

The contextvar is a plain module-level one; the middleware sets it per
request (pure ASGI, like the CSRF middleware — nothing here reads a body).
Outside a request (CLI, tests calling services directly) it reads ``None``,
and ``audit.record`` stores that as SQL NULL: "no request" is a fact worth
recording, not a gap to hide.
"""

import re
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-Id"
VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    """The current request's id, or ``None`` outside a request."""
    return _request_id.get()


def _accepted(value: str | None) -> str:
    if value is not None and VALID_REQUEST_ID.fullmatch(value):
        return value
    return uuid.uuid4().hex


class RequestContextMiddleware:
    """Assign the request id before anything downstream can need it."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        supplied: str | None = None
        for name, value in scope.get("headers", []):
            if name == b"x-request-id":
                supplied = value.decode("latin-1")
                break
        request_id = _accepted(supplied)
        token = _request_id.set(request_id)

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append((b"x-request-id", request_id.encode("ascii")))
            await send(message)

        try:
            await self.app(scope, receive, send_with_header)
        finally:
            _request_id.reset(token)
