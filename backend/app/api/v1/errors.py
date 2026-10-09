"""HTTP error helpers shared by the v1 endpoints (extracted in F033).

The one resident is :func:`field_error`, born in F030's change-password
endpoint and extracted here when F033's admin API became its second consumer:
a hand-built 422 entry in Pydantic's shape, used whenever a *deliberate*
refusal must reach the caller as a field-addressable validation error.
"""


def field_error(field: str, message: str) -> dict[str, object]:
    """One Pydantic-shaped 422 entry — deliberately without ``input``.

    Pydantic's own validation errors echo the offending value in ``input``;
    for credential fields that value is a password, and a response body is
    the last place it belongs. ``loc``/``msg``/``type`` is everything the
    frontend's field mapper reads (``frontend/src/lib/errors.ts``), so
    omitting ``input`` changes nothing for the client and everything for
    "never echo a credential".
    """
    return {"type": "value_error", "loc": ["body", field], "msg": message}
