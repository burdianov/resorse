"""Readiness endpoint (F065, BP-8.4b).

``/health`` answers "this process is up" and claims nothing it has not measured
(its own module says so). This answers the other question — "does this process
have what it needs to serve?" — as **one answer per dependency**:

| dependency | what answers it | a *down* answer means |
|---|---|---|
| ``postgresql`` | ``database_reachable()`` — ``SELECT 1`` over the pooled engine | **503, ``not_ready``**: no route can serve without it |
| ``gotenberg`` | ``conversion.health()`` (F052) | 200, ``degraded``: only the DOCX half of BP-7.9b needs it (C40) |
| ``pdf-engine`` | ``reports.self_test()`` (F051) | 200, ``degraded``: in-process, but an installed engine can still be broken (C41) |

**Degraded is not a failure, and the HTTP status says which is which.** A
monitor reads the status line first, so an optional dependency that is down
must not take the application out of rotation: only PostgreSQL's answer turns
into a **503**. The alternatives are both worse — a 200 for everything would
make the endpoint a decoration that can never fail a check, and a 503 for a
down converter would turn one sub-feature into an outage.

**The three probes are asked at once.** Each has a bound of its own (the
database probe's timeout, ``GOTENBERG_TIMEOUT_SECONDS``, one render), so
awaiting them in sequence would make readiness as slow as their sum for no
reason. None of them is wrapped in ``try`` here: each answers a boolean and
never raises — the contract C40 and C41 state for exactly this purpose — and
this route is the caller that would otherwise write three copies of the same
``except``.

**Not public, and the protection belongs to the ingress rather than to this
route.** BP-8.3 lists ``/api/v1/ready`` as ``[protected appropriately at
ingress]``, and that is the only shape that works: the callers are
infrastructure — the container, a monitor on the box, the operator — and
infrastructure cannot hold a session cookie. The route therefore asks for no
session, and what keeps it off the internet is the edge: ``deploy/Caddyfile``
refuses this path for everyone outside, and the API is never published on its
own (``ARCHITECTURE`` §1, ``DEPLOYMENT`` §11). ``/health`` stays liveness and
carries no dependency claim, so the container healthcheck keeps asking the
question it can answer.
"""

import asyncio
from typing import Literal

from fastapi import APIRouter, Response, status
from starlette.concurrency import run_in_threadpool

from app.core.database import database_reachable
from app.schemas.readiness import DependencyCheck, ReadinessResponse
from app.services import conversion, reports

router = APIRouter()


def _answer(up: bool) -> Literal["up", "down"]:
    """A probe's boolean, said the way the body says it."""
    return "up" if up else "down"


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe",
    responses={
        503: {
            "model": ReadinessResponse,
            "description": "A required dependency — PostgreSQL — is down.",
        },
    },
)
async def ready(response: Response) -> ReadinessResponse:
    """Whether this process can serve, and what it is missing if it cannot."""
    postgresql, gotenberg, pdf_engine = await asyncio.gather(
        database_reachable(),
        conversion.health(),
        run_in_threadpool(reports.self_test),
    )
    checks = [
        DependencyCheck(name="postgresql", status=_answer(postgresql), required=True),
        DependencyCheck(name="gotenberg", status=_answer(gotenberg), required=False),
        DependencyCheck(name="pdf-engine", status=_answer(pdf_engine), required=False),
    ]
    if not postgresql:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(status="not_ready", checks=checks)
    if not (gotenberg and pdf_engine):
        return ReadinessResponse(status="degraded", checks=checks)
    return ReadinessResponse(status="ready", checks=checks)
