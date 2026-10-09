"""The application-settings registry (F039, BP-7.5).

The declared universe of runtime settings: every key the API will accept, its
**type**, its default, and how a candidate value is validated. The table
(``app_settings``) stores overrides for these keys and nothing else — the
service refuses unknown keys *before* any write, which is what §7.5's "no
arbitrary mass-assignment" means in practice: the attack surface of the
settings API is exactly this file, and this file is reviewed code.

Why a registry instead of free-form key/value:

- **Typed.** A date format is one of five strings, a timezone must be a real
  IANA zone — validation lives beside the declaration so a new key cannot be
  added without deciding what "valid" means for it.
- **Defaulted.** An unwritten key reads as its default; a fresh deployment
  needs no seeding, and a key added in a later release simply starts there.
- **One spelling.** The parser, the service and (once F040 lands) the
  frontend all read names from here; two spellings of a settings key would be
  the classic near-match this codebase designs against.

Deliberately **not** settings (this file is the allowlist's boundary): the
Argon2 parameters (F026's reviewed constants), session lifetimes and login
throttles (F025/F026's confirmed values — changing them mid-flight has
session-wide effects no settings form should reach), and anything secret —
BP-7.5 is explicit that secrets stay outside the UI and the config DB.

Notification keys are F045's to add when its behaviour exists; inventing
defaults for behaviour that does not exist yet would be exactly the fake
configuration this pack forbids.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# The date-format vocabulary: the source's five options (BP-7.5), mapped to
# date-fns patterns on the frontend at F040.
DATE_FORMATS: tuple[str, ...] = (
    "DD.MM.YYYY",
    "MM/DD/YYYY",
    "YYYY-MM-DD",
    "DD-MM-YYYY",
    "DD/MM/YYYY",
)

DEFAULT_TIMEZONE = "Asia/Dubai"  # the product's locale; UTC remains valid


@dataclass(frozen=True)
class SettingSpec:
    """One declared setting: its default and its validation.

    ``validate`` raises :class:`ValueError` with a sentence written for the
    person editing the settings form — the same rule as policy messages:
    state the rule, never echo the value.
    """

    key: str
    default: Any
    validate: Callable[[Any], Any]
    description: str


def _string(min_length: int, max_length: int) -> Callable[[Any], Any]:
    def validate(value: Any) -> str:
        if not isinstance(value, str):
            # TypeError for a wrong JSON type, ValueError for a bad value of
            # the right type — the service catches both and answers 422 at
            # the key either way (TRY004 keeps the distinction honest).
            raise TypeError("This setting must be a string.")
        cleaned = value.strip()
        if len(cleaned) < min_length:
            raise ValueError(f"This setting must be at least {min_length} characters long.")
        if len(cleaned) > max_length:
            raise ValueError(f"This setting must be at most {max_length} characters long.")
        return cleaned

    return validate


def _date_format(value: Any) -> str:
    if not isinstance(value, str) or value not in DATE_FORMATS:
        raise ValueError("Choose one of the supported date formats.")
    return value


def _timezone(value: Any) -> str:
    if not isinstance(value, str):
        raise TypeError("This setting must be a string.")
    cleaned = value.strip()
    try:
        ZoneInfo(cleaned)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError("Choose a valid IANA timezone, e.g. `Asia/Dubai`.") from error
    return cleaned


SETTING_SPECS: tuple[SettingSpec, ...] = (
    SettingSpec(
        key="branding.app_name",
        default="Application Platform",
        validate=_string(3, 64),
        description="The display name shown in the shell and on the auth screens.",
    ),
    SettingSpec(
        key="branding.app_description",
        default="",
        validate=_string(0, 200),
        description="A one-line description shown where the app introduces itself.",
    ),
    SettingSpec(
        key="display.date_format",
        default="DD.MM.YYYY",
        validate=_date_format,
        description="How dates are displayed; the source's five formats.",
    ),
    SettingSpec(
        key="display.timezone",
        default=DEFAULT_TIMEZONE,
        validate=_timezone,
        description="The timezone display-time conversions use (stored instants stay UTC).",
    ),
)

SETTINGS_BY_KEY: dict[str, SettingSpec] = {spec.key: spec for spec in SETTING_SPECS}

# The registry's own consistency, enforced at import: a duplicate key would
# make "which spec wins" depend on tuple order — the near-match class again.
assert len(SETTINGS_BY_KEY) == len(SETTING_SPECS), "duplicate setting key in the registry"
# Every default must pass its own validator — a broken default would surface
# as a 500 on first read instead of here.
for _spec in SETTING_SPECS:
    _spec.validate(_spec.default)
del _spec


def defaults() -> dict[str, Any]:
    """A fresh copy of every default — callers may mutate what they get."""
    return {spec.key: spec.default for spec in SETTING_SPECS}


def validate_value(key: str, value: Any) -> Any:
    """The validated, normalised value for ``key``, or ``ValueError``.

    Unknown keys raise before anything is written — the allowlist is the
    point (BP-7.5's mass-assignment rule).
    """
    spec = SETTINGS_BY_KEY.get(key)
    if spec is None:
        raise ValueError(f"Unknown setting: `{key}`.")
    return spec.validate(value)
