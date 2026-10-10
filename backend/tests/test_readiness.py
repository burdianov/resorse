"""Readiness endpoint (F065, BP-8.4b).

The acceptance is the difference between two questions, so that is what these
tests ask: *alive* is ``GET /api/v1/health``, which affirms only that the
process is running, and *serving* is ``GET /api/v1/ready``, which asks the
dependencies and reports one answer per dependency. A down optional dependency
is ``degraded`` and still a 200 — never a crash and never an outage — while a
down PostgreSQL is the one answer that becomes a 503.

The route carries no session dependency (BP-8.3 protects it at the ingress,
not in the application), which is why every client here reaches it
unauthenticated.

The probes are *replaced* in the database-free tests rather than exercised: a
verdict test does not need a real PostgreSQL, a real Gotenberg and a real render
to say what the body holds when one of them is down. The probes' own behaviour
is tested where they live, and the marked tests at the end of this file ask the
real ``database_reachable`` the real question.
"""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.api.v1 import readiness
from app.core import database
from app.main import create_app
from app.services import conversion, reports


@pytest_asyncio.fixture
async def app_client() -> AsyncIterator[httpx.AsyncClient]:
    """A client for the whole application, with nothing overridden.

    ``create_app()`` rather than the imported ``app``: the only things a test
    here replaces are the probes, and a test that also stubbed the session
    override would be testing a different application than the one that ships.
    """
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app()),
        base_url="http://testserver",
    ) as client:
        yield client


def _probe(answers: bool) -> Callable[[], Awaitable[bool]]:
    """A stand-in for a probe that answers a fixed fact."""

    async def probe() -> bool:
        return answers

    return probe


def _stub_probes(
    monkeypatch: pytest.MonkeyPatch,
    *,
    postgresql: bool,
    gotenberg: bool,
    pdf_engine: bool,
) -> None:
    """Make each probe answer what the test is about.

    Each name is patched where the route reads it: the two services are reached
    through their module (``conversion.health()``), so that is where a stub has
    to sit.
    """
    monkeypatch.setattr(readiness, "database_reachable", _probe(postgresql))
    monkeypatch.setattr(conversion, "health", _probe(gotenberg))
    monkeypatch.setattr(reports, "self_test", lambda: pdf_engine)


def _checks(body: dict[str, object]) -> dict[str, dict[str, object]]:
    """The body's checks, keyed by dependency name."""
    checks = body["checks"]
    assert isinstance(checks, list)
    named: dict[str, dict[str, object]] = {}
    for check in checks:
        assert isinstance(check, dict)
        named[check["name"]] = check
    return named


@pytest.mark.asyncio
async def test_a_stack_whose_dependencies_all_answer_is_ready(
    app_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_probes(monkeypatch, postgresql=True, gotenberg=True, pdf_engine=True)

    response = await app_client.get("/api/v1/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert _checks(body) == {
        "postgresql": {"name": "postgresql", "status": "up", "required": True},
        "gotenberg": {"name": "gotenberg", "status": "up", "required": False},
        "pdf-engine": {"name": "pdf-engine", "status": "up", "required": False},
    }


@pytest.mark.parametrize(
    ("gotenberg", "pdf_engine", "down"),
    [(False, True, "gotenberg"), (True, False, "pdf-engine"), (False, False, "gotenberg")],
)
@pytest.mark.asyncio
async def test_a_down_optional_dependency_is_degraded_and_still_serving(
    app_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    gotenberg: bool,
    pdf_engine: bool,
    down: str,
) -> None:
    """Each optional half failing, and both at once.

    The answer is a 200 the whole way: a converter or a report engine that is
    down must not take a serving application out of rotation, and it must not
    produce a 500 either — which is what a probe that raised would give.
    """
    _stub_probes(monkeypatch, postgresql=True, gotenberg=gotenberg, pdf_engine=pdf_engine)

    response = await app_client.get("/api/v1/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert _checks(body)[down]["status"] == "down"
    assert _checks(body)["postgresql"]["status"] == "up"


@pytest.mark.asyncio
async def test_readiness_separates_serving_from_alive(
    app_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The same application, one question apart.

    With PostgreSQL gone, liveness still answers ``ok`` — the process really is
    running, and a container restarted to fix a database fixes nothing — while
    readiness refuses to serve.
    """
    _stub_probes(monkeypatch, postgresql=False, gotenberg=True, pdf_engine=True)

    alive = await app_client.get("/api/v1/health")
    serving = await app_client.get("/api/v1/ready")

    assert alive.status_code == 200
    assert alive.json()["status"] == "ok"
    assert serving.status_code == 503
    body = serving.json()
    assert body["status"] == "not_ready"
    assert _checks(body)["postgresql"] == {
        "name": "postgresql",
        "status": "down",
        "required": True,
    }
    # The optional answers are still reported: refusing to serve is not a
    # reason to withhold what else was measured.
    assert _checks(body)["gotenberg"]["status"] == "up"


@pytest.mark.asyncio
async def test_the_endpoint_answers_when_no_database_is_configured(
    app_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An unconfigured database is a 503 that names it, not a 500.

    ``get_engine()`` raises when ``DATABASE_URL`` is unset — deliberately, at
    use rather than at import. That raise is one of the ways this probe answers
    *down*, so an operator who has not configured a database yet reads which
    dependency is missing instead of an empty server error.

    Only the two optional probes are stubbed: the real
    ``readiness.database_reachable`` runs here, over a ``get_engine`` that
    cannot produce an engine.
    """
    monkeypatch.setattr(conversion, "health", _probe(False))
    monkeypatch.setattr(reports, "self_test", lambda: True)

    def unconfigured() -> AsyncEngine:
        raise RuntimeError("DATABASE_URL is not configured.")

    monkeypatch.setattr(database, "get_engine", unconfigured)

    response = await app_client.get("/api/v1/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert _checks(body)["postgresql"]["status"] == "down"


@pytest.mark.asyncio
async def test_the_probes_are_asked_at_once(
    app_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A barrier only opens when both parties arrive.

    Nothing else in this file would notice if the route awaited its probes one
    after another — the answers would be identical, only slower than they need
    to be. A probe that waits for the other one cannot pass a sequential
    implementation, and ``wait_for`` turns that into a red test rather than a
    hung run.
    """
    arrival = asyncio.Barrier(2)

    async def database_probe() -> bool:
        await arrival.wait()
        return True

    async def converter_probe() -> bool:
        await arrival.wait()
        return True

    monkeypatch.setattr(readiness, "database_reachable", database_probe)
    monkeypatch.setattr(conversion, "health", converter_probe)
    monkeypatch.setattr(reports, "self_test", lambda: True)

    response = await asyncio.wait_for(app_client.get("/api/v1/ready"), timeout=10)

    assert response.status_code == 200
    assert response.json()["status"] == "ready"


@pytest.mark.asyncio
async def test_database_reachable_answers_false_when_nothing_is_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The probe's own never-raises contract, at its cheapest case."""

    def unconfigured() -> AsyncEngine:
        raise RuntimeError("DATABASE_URL is not configured.")

    monkeypatch.setattr(database, "get_engine", unconfigured)

    assert await database.database_reachable() is False


@pytest.mark.integration
@pytest.mark.asyncio
async def test_database_reachable_answers_true_against_the_test_database(
    test_database_url: str,
) -> None:
    """The same probe, asked the real question, of a database that is up.

    ``test_database_url`` is what points the session at ``app_test``, so this
    is the database the rest of the suite uses — nothing near ``app_dev``. The
    engine is built here, and both tests in this pair do that on purpose: the
    application's own engine is an ``lru_cache``d singleton, and pytest-asyncio
    gives every test a new event loop, so an engine one test built is unusable
    in the next one (asyncpg's connections belong to the loop that made them).
    """
    engine = create_async_engine(test_database_url)
    try:
        assert await database.database_reachable(engine=engine) is True
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_database_reachable_answers_false_when_nothing_is_listening(
    test_database_url: str,
) -> None:
    """A database that is not there, at the test database's own address.

    The coordinates come from the fixture and only the port changes, so this is
    a real connection attempt against a real host with nothing behind it: the
    production failure the probe has to survive is the driver's, and a stand-in
    engine would not exercise it. ``database_reachable`` is called directly
    because everything above it — the route — replaces this answer.

    Port 1 is the choice: it is privileged, so no test service can be listening
    there, and a refused connection comes back at once rather than after the
    probe's timeout.
    """
    engine = create_async_engine(
        make_url(test_database_url).set(port=1).render_as_string(hide_password=False)
    )
    try:
        assert await database.database_reachable(engine=engine) is False
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_endpoint_is_ready_over_a_real_database(client: httpx.AsyncClient) -> None:
    """The whole way through: the running application, the real PostgreSQL.

    The overall status is asserted as one of the two *serving* states rather
    than ``ready``, because whether Gotenberg happens to be up is not this
    test's question — the database's answer is, and it is the one a deployment
    is taken out of rotation for.

    This is the one test where the application builds its own engine
    (``get_engine()``). It is cached for the session, so a test written after
    it that wants a probe question answered should build an engine of its own
    (as the pair above do) rather than borrow this one onto a fresh loop.
    """
    response = await client.get("/api/v1/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ready", "degraded"}
    assert _checks(body)["postgresql"]["status"] == "up"
    assert _checks(body)["pdf-engine"]["status"] == "up"
