"""Liveness endpoint.

Reports only what it can actually observe: that this process is up and serving.
A separate readiness endpoint — which will additionally check PostgreSQL — is
part of the API contract (docs/ARCHITECTURE.md §10) but not implemented yet;
nothing here should claim a dependency it has not measured.
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
