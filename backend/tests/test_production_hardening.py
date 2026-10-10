"""Production hardening (F060): startup refusal, headers, errors, logs, the scan hook.

None of these tests reach the database — the production rules are functions of
:class:`Settings`, and the HTTP checks use routes that never open a session —
so they carry no ``integration`` marker (``tests/test_markers.py``).

What is pinned, in the order a mistake would cost:

- **Production refuses to start** on a placeholder or weak database password,
  an origin list nobody chose, a loopback or non-https origin, and an upload
  or converter address left at its development default. Development passes.
- **Every response carries the API's header floor**, and a route's own value
  wins over the default.
- **An unhandled error is answered as JSON** with the request id and no
  exception text, and is logged once, with the id, the traceback and no query
  string.
- **The log line is one JSON object**, carrying the request id when there is
  one, and extra data is limited to scalars.
- **The upload route's scan hook is the injectable seam**, and its shipped
  answer is the no-op scanner.
"""

import json
import logging
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from app import main
from app.core.config import Settings
from app.core.logs import JsonFormatter
from app.core.request_context import REQUEST_ID_HEADER, RequestContextMiddleware
from app.core.security_headers import DEFAULT_HEADERS, SecurityHeadersMiddleware
from app.core.startup import ProductionConfigError, assert_production_ready, production_problems
from app.services.storage import NoMalwareScanner, get_malware_scanner

STRONG_PASSWORD = "k3p9Vq7x2Lm8Tz4Ww1Rd"
GOOD_URL = f"postgresql+asyncpg://resors:{STRONG_PASSWORD}@postgres:5432/resors"


@pytest.fixture(autouse=True)
def settings_come_from_the_test_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    """Clear every setting from the process environment for this module.

    The integration fixtures export DATABASE_URL and friends for their own
    process; an "unset" case here must be unset, whatever the session did.
    """
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)


def production(**overrides: Any) -> Settings:
    """A production configuration that passes every check, then one change at a time."""
    values: dict[str, Any] = {
        "environment": "production",
        "database_url": GOOD_URL,
        "allowed_origins": "https://resors.example.org",
        "storage_root": "/var/lib/resors/uploads",
        "gotenberg_url": "http://gotenberg:3000",
    }
    values.update(overrides)
    # None means "not configured here": an absent key, not an explicit null, so
    # the field stays out of model_fields_set exactly as an unset variable would.
    # The repository .env is skipped: a developer's file must not decide these tests.
    return isolated(**{key: value for key, value in values.items() if value is not None})


def isolated(**values: Any) -> Settings:
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def test_a_complete_production_configuration_has_no_problems() -> None:
    assert production_problems(production()) == []


def test_development_is_never_checked() -> None:
    assert production_problems(isolated(environment="development")) == []


@pytest.mark.parametrize(
    ("overrides", "fragment"),
    [
        ({"database_url": None}, "DATABASE_URL is not set"),
        (
            {"database_url": "postgresql+asyncpg://resors:replace-with-a-generated-password@h/d"},
            "contains a placeholder",
        ),
        ({"database_url": "postgresql+asyncpg://resors:postgres@postgres/resors"}, "well-known"),
        (
            {"database_url": "postgresql+asyncpg://resors:short1234@postgres/resors"},
            "shorter than 16",
        ),
        ({"database_url": "postgresql+asyncpg://resors@postgres/resors"}, "carries no password"),
        ({"database_url": "not a url at all"}, "not a valid database URL"),
        ({"allowed_origins": "http://resors.example.org"}, "is not an https origin"),
        ({"allowed_origins": "https://localhost"}, "is a loopback address"),
        ({"allowed_origins": "*"}, "is not an origin"),
        ({"allowed_origins": " , "}, "ALLOWED_ORIGINS is empty"),
        ({"storage_root": None}, "STORAGE_ROOT must be set"),
        ({"gotenberg_url": "http://localhost:3100"}, "GOTENBERG_URL must name"),
    ],
)
def test_each_unsafe_setting_is_named(overrides: dict[str, Any], fragment: str) -> None:
    problems = production_problems(production(**overrides))
    assert any(fragment in problem for problem in problems), problems


def test_an_implicit_origin_is_refused_even_when_it_is_the_dev_default() -> None:
    settings = isolated(
        environment="production",
        database_url=GOOD_URL,
        storage_root="/var/lib/resors/uploads",
        gotenberg_url="http://gotenberg:3000",
    )
    assert settings.allowed_origins == "http://localhost:5173"
    problems = production_problems(settings)
    assert any("must be set explicitly" in problem for problem in problems), problems


def test_the_refusal_lists_every_problem_and_never_echoes_the_password() -> None:
    settings = production(
        database_url="postgresql+asyncpg://resors:postgres@postgres/resors",
        allowed_origins="http://localhost:5173",
    )
    with pytest.raises(ProductionConfigError) as refused:
        assert_production_ready(settings)
    message = str(refused.value)
    assert "well-known" in message
    assert "not an https origin" in message
    assert "postgres/resors" not in message
    assert "resors:postgres" not in message


def test_create_app_refuses_to_construct_with_unsafe_production_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "get_settings", lambda: production(database_url=None))
    with pytest.raises(ProductionConfigError):
        main.create_app()


@pytest.mark.asyncio
async def test_every_api_response_carries_the_header_floor() -> None:
    transport = httpx.ASGITransport(app=main.create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
    assert response.status_code == 200
    for name, value in DEFAULT_HEADERS:
        assert response.headers[name.decode()] == value.decode()
    assert response.headers[REQUEST_ID_HEADER]


@pytest.mark.asyncio
async def test_a_route_can_set_its_own_header_and_the_default_yields() -> None:
    async def custom(request: Request) -> JSONResponse:
        return JSONResponse({"ok": True}, headers={"Cache-Control": "private, max-age=60"})

    app = Starlette(routes=[Route("/custom", custom)])
    app.add_middleware(SecurityHeadersMiddleware)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/custom")
    assert response.headers["cache-control"] == "private, max-age=60"
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.fixture
def failing_app() -> Iterator[Starlette]:
    async def boom(request: Request) -> JSONResponse:
        raise RuntimeError("the secret value is in this message")

    async def page(request: Request) -> JSONResponse:
        return JSONResponse({"ok": True})

    app = Starlette(routes=[Route("/boom", boom), Route("/page", page)])
    app.add_middleware(RequestContextMiddleware)
    yield app


@pytest.mark.asyncio
async def test_an_unhandled_error_is_a_json_500_with_the_request_id(
    failing_app: Starlette, caplog: pytest.LogCaptureFixture
) -> None:
    transport = httpx.ASGITransport(app=failing_app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom?token=abc123", headers={REQUEST_ID_HEADER: "req-42"})

    assert response.status_code == 500
    body = response.json()
    assert body == {"detail": "Internal server error.", "request_id": "req-42"}
    assert response.headers[REQUEST_ID_HEADER] == "req-42"
    assert "secret value" not in response.text

    errors = [record for record in caplog.records if record.levelno >= logging.ERROR]
    assert len(errors) == 1
    assert errors[0].exc_info is not None
    assert errors[0].request_id == "req-42"  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_the_access_line_carries_the_status_and_no_query_string(
    failing_app: Starlette, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="app.request")
    transport = httpx.ASGITransport(app=failing_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/page?token=abc123")

    access = [record for record in caplog.records if record.getMessage() == "request"]
    assert len(access) == 1
    assert access[0].path == "/page"  # type: ignore[attr-defined]
    assert access[0].status == 200  # type: ignore[attr-defined]
    assert "abc123" not in json.dumps(vars(access[0]), default=str)


def test_the_log_line_is_one_json_object_with_the_request_id() -> None:
    record = logging.LogRecord(
        name="app.test",
        level=logging.WARNING,
        pathname=__file__,
        lineno=1,
        msg="something %s",
        args=("happened",),
        exc_info=None,
    )
    record.details = {"password": "hunter2"}  # a container: dropped, never stringified
    record.attempts = 3  # a scalar: kept
    line = JsonFormatter().format(record)
    payload = json.loads(line)
    assert payload["level"] == "WARNING"
    assert payload["message"] == "something happened"
    assert payload["request_id"] is None
    assert payload["attempts"] == 3
    assert "details" not in payload
    assert "hunter2" not in line
    assert "\n" not in line


def test_the_upload_scan_hook_defaults_to_the_no_op_scanner() -> None:
    assert isinstance(get_malware_scanner(), NoMalwareScanner)
