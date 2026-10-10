"""Liveness endpoint.

Reports only what it can actually observe: that this process is up and serving.
The other question — whether this process has what it needs to serve — belongs
to readiness, which is its own route (`app/api/v1/readiness.py`, F065): the two
answer differently, and a container restarted over a database outage would be
restarted to fix nothing. Nothing here should claim a dependency it has not
measured.
"""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: Literal["ok"]
    name: str
    version: str
    environment: str


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        name=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )
