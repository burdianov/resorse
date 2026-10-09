"""The cookie contract: names, attributes, and the one place they are set.

Everything this application stores in a browser is decided here — F028 spelled
the attributes out at the login endpoint, and F029 moved them into this module
the moment logout needed the *exact* same spellings back. The attributes are
load-bearing, not cosmetic:

- ``__Host-session`` — the session ID. ``HttpOnly`` (no script may read it),
  ``Secure``, ``SameSite=Lax``, ``Path=/``, no ``Domain``. The ``__Host-``
  prefix is only honoured (by browsers, and by us) when the cookie is Secure,
  Path=/ and Domain-less — which is what makes "a subdomain cannot set or
  shadow this cookie" true. ``Secure`` holds in development too: browsers
  treat ``http://localhost`` as a secure context. No ``Max-Age``/``Expires``:
  a browser-session cookie; the row's deadlines are the authority (F028).
- ``__Host-csrf`` — the double-submit companion, deliberately readable
  (``HttpOnly=False``): the frontend copies it into the ``X-CSRF-Token``
  header and F029's middleware compares the two. It is not a credential on
  its own — an attacker's page cannot read it cross-origin, and the
  ``__Host-`` prefix stops a sibling subdomain from planting one.

Deleting the cookies needs the same attributes as setting them: a
``Set-Cookie`` for a ``__Host-`` name is only accepted — which is to say,
only *deletes* — when it itself is Secure, Path=/ and Domain-less.
"""

from typing import Literal

from fastapi import Response

SESSION_COOKIE_NAME = "__Host-session"
CSRF_COOKIE_NAME = "__Host-csrf"

# The header the SPA copies ``__Host-csrf`` into (F029's double-submit check).
CSRF_HEADER_NAME = "X-CSRF-Token"

# `SameSite=Lax` is the first CSRF layer (ARCHITECTURE §3): the cookies do not
# ride on cross-site POSTs at all, so most attacks die before the other two
# layers are consulted. The remaining ones are F029's origin check and
# double-submit. (Annotated as the literal Starlette's `set_cookie` accepts.)
_SAMESITE: Literal["lax"] = "lax"


def set_session_cookies(response: Response, *, token: str, csrf_token: str) -> None:
    """Issue a fresh session/CSRF pair. Used by login (F028) and rotation (F029)."""
    response.set_cookie(
        SESSION_COOKIE_NAME, token, httponly=True, secure=True, samesite=_SAMESITE, path="/"
    )
    response.set_cookie(
        CSRF_COOKIE_NAME, csrf_token, httponly=False, secure=True, samesite=_SAMESITE, path="/"
    )


def clear_session_cookies(response: Response) -> None:
    """Expire both cookies. Used by logout and logout-all (F029)."""
    response.delete_cookie(
        SESSION_COOKIE_NAME, path="/", secure=True, samesite=_SAMESITE, httponly=True
    )
    response.delete_cookie(
        CSRF_COOKIE_NAME, path="/", secure=True, samesite=_SAMESITE, httponly=False
    )
