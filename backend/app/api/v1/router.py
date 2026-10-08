"""Aggregate router for /api/v1.

Routers only — no business logic lives here (ARCHITECTURE §4).
"""

from fastapi import APIRouter

from app.api.v1 import health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
