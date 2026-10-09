"""Aggregate router for /api/v1.

Routers only — no business logic lives here (ARCHITECTURE §4).
"""

from fastapi import APIRouter

from app.api.v1 import (
    admin_permissions,
    admin_roles,
    admin_settings,
    admin_users,
    auth,
    health,
    me_preferences,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(me_preferences.router, tags=["auth"])
api_router.include_router(admin_users.router, tags=["admin"])
api_router.include_router(admin_roles.router, tags=["admin"])
api_router.include_router(admin_permissions.router, tags=["admin"])
api_router.include_router(admin_settings.router, tags=["admin"])
