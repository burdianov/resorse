"""Response headers the API sends on every response (F060; BP-6.4 "safe headers").

The browser-facing policy — the Content-Security-Policy for the SPA, HSTS and
the rest of the edge set — is served by Caddy (`deploy/Caddyfile`), because
the HTML and its scripts never pass through this process. These headers are
the API's own floor: they keep a JSON or file response safe when the API is
reached without the proxy (a direct connection in development, a misrouted
request) and are what a reviewer should find on every response regardless of
the path that served it.

A header the route has already set is left alone, so a route that needs a
different value (a future inline-disposition preview, say) can say so. The
one default that is a policy rather than a hardening is ``Cache-Control``:
an authenticated response is private to its session and must not be stored
by a shared cache.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

DEFAULT_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    # Never sniff a response into another content type (a JSON or a downloaded
    # file must not become HTML in a browser).
    (b"x-content-type-options", b"nosniff"),
    # The API is never rendered in a frame; the SPA's own policy is at the edge.
    (b"x-frame-options", b"DENY"),
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
    (b"referrer-policy", b"no-referrer"),
    (b"cross-origin-resource-policy", b"same-origin"),
    (b"cache-control", b"no-store"),
)


class SecurityHeadersMiddleware:
    """Add :data:`DEFAULT_HEADERS` to each HTTP response that does not set them."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                for name, value in DEFAULT_HEADERS:
                    if name not in present:
                        headers.append((name, value))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
