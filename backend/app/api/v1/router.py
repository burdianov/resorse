"""Aggregate router for /api/v1.

Routers only — no business logic lives here (ARCHITECTURE §4).
"""

from fastapi import APIRouter

from app.api.v1 import admin_users, auth, health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(admin_users.router, tags=["admin"])
