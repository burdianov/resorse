"""Admin settings shapes (F039).

One response shape and one request body:

- ``SettingsResponse`` wraps the snapshot in a ``values`` object, so the
  response can grow metadata later without the client digging into a bare
  map.
- The **PUT body is the bare map itself** — ``{"display.date_format":
  "DD.MM.YYYY", …}`` — rather than a nested ``values`` field. That choice is
  what makes the server's field-addressable 422s land naturally: an unknown
  or invalid key addresses as ``loc ["body", "<key>"]``, exactly the path the
  frontend's error mapper turns into a message under the matching form
  field (F040's form uses the registry keys as its field names).
"""

from typing import Any

from pydantic import BaseModel


class SettingsResponse(BaseModel):
    """The effective settings: every registry key, override or default."""

    values: dict[str, Any]
