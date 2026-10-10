"""Structured logging (F060; BP-8.4c "structured logging with request IDs").

Every line the application writes is one JSON object on stdout, carrying the
request id that the response's ``X-Request-Id`` header and the audit trail
(F043) also carry, so a log line, an error report and an audit row join on one
string. Uvicorn's own access log is switched off in the production image
(``--no-access-log``); the request middleware writes the access line instead,
with the path but never the query string, which is where a token would travel.

What is deliberately **not** logged: request bodies, headers (cookies,
``Authorization``, ``X-CSRF-Token``), form fields and the database URL. The
formatter does not add them, and a caller that passes them in ``extra`` is
still limited: only scalars are emitted. A container (a dict, a model, a
request) is dropped rather than stringified, because its ``str`` form is
exactly where a password would reappear.
"""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from app.core.request_context import get_request_id

LOG_LEVELS = frozenset({"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"})

# The handler this module installed last, so a reconfiguration replaces it.
_installed: logging.Handler | None = None

# Attributes the stdlib sets on every record. Anything else on a record came
# from the caller's ``extra=`` and is the only extra data that is emitted.
_STANDARD_ATTRIBUTES = frozenset(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


def _is_scalar(value: object) -> bool:
    return value is None or isinstance(value, bool | int | float | str)


class JsonFormatter(logging.Formatter):
    """One record, one JSON object per line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": get_request_id(),
        }
        for key, value in vars(record).items():
            if key in _STANDARD_ATTRIBUTES or key.startswith("_") or not _is_scalar(value):
                continue
            payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str) -> None:
    """Route the root logger to stdout as JSON at ``level``.

    Idempotent: a second call replaces the handler rather than stacking one, so
    repeated application construction (tests) does not duplicate every line.
    """
    if level not in LOG_LEVELS:
        raise ValueError(f"LOG_LEVEL must be one of {sorted(LOG_LEVELS)}.")
    global _installed
    root = logging.getLogger()
    if _installed is not None:
        root.removeHandler(_installed)
    _installed = logging.StreamHandler(sys.stdout)
    _installed.setFormatter(JsonFormatter())
    root.addHandler(_installed)
    root.setLevel(level)
