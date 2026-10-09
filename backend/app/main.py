"""Application assembly.

Normal FastAPI composition. The reference project carried a global
``APIRouter.include_router`` monkey patch for an old compatibility problem;
BIG-PROMPT §6.2h forbids copying it, and nothing here needs it.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.csrf import CsrfMiddleware
from app.core.database import dispose_engine
from app.core.request_context import RequestContextMiddleware


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # The database engine is created lazily on first use (app/core/database.py),
    # so startup only has to validate configuration — which F028/F060 add.
    yield
    # Return pooled connections on the way out; a reload otherwise leaves them
    # for the server to time out.
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
    # CSRF (F029) wraps everything, so no unsafe endpoint can be added
    # without it (app/core/csrf.py). Login is exempt from the double-submit
    # only — it establishes a session rather than acting under one.
    application.add_middleware(
        CsrfMiddleware,
        trusted_origins=settings.trusted_origins,
        session_exempt_paths=frozenset({f"{settings.api_v1_prefix}/auth/login"}),
    )
    # The request id (F043) wraps even the CSRF refusal: every response
    # carries X-Request-Id, and audit rows written downstream record it.
    application.add_middleware(RequestContextMiddleware)
    application.include_router(api_router, prefix=settings.api_v1_prefix)
    return application


app = create_app()
