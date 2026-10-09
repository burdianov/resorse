"""Per-user preference shapes (F041).

Free-form JSON values under a bounded key shape (C30): preferences are
display choices whose vocabulary belongs to their consumers (F048), so there
is no server registry — the guards are the key's pattern, the value's size,
and the refusal of a JSON ``null`` (a preference equal to nothing is a
DELETE; both a null value and an absent row meaning "no preference" would be
the classic two-spellings problem).

The size cap is the JSON serialization, not the Python object: a hostile
megabyte preference must earn a 422, not a payload anybody has to parse.
"""

import json
from typing import Any

from pydantic import BaseModel, Field, field_validator

# The serialized value's cap. Preferences are small display choices; 8 KiB is
# generous for a column layout and tiny for an attack.
MAX_PREFERENCE_VALUE_BYTES = 8192


class PreferenceItem(BaseModel):
    key: str
    value: Any


class PreferencesResponse(BaseModel):
    """Every preference of the signed-in user — and only theirs."""

    items: list[PreferenceItem]


class PutPreferenceRequest(BaseModel):
    value: Any = Field(...)

    @field_validator("value")
    @classmethod
    def _value(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("A preference needs a value; delete the key instead of nulling it.")
        encoded = json.dumps(value)
        if len(encoded.encode("utf-8")) > MAX_PREFERENCE_VALUE_BYTES:
            raise ValueError(f"Preference values are at most {MAX_PREFERENCE_VALUE_BYTES} bytes.")
        return value
