"""Liveness endpoint.

Reports only what it can actually observe: that this process is up and serving.
A separate readiness endpoint is introduced with F023, once there is a real
dependency (PostgreSQL) whose status it can honestly report.
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
