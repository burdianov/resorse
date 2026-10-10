# syntax=docker/dockerfile:1
#
# The API image (F059, BIG-PROMPT §11.2). One image runs two roles: the
# one-shot `migrate` service (`alembic upgrade head`) and the `backend` service
# (uvicorn). Both come from docker-compose.prod.yml.
#
# Pins: uv is the version the lock was generated with; python:3.14 satisfies
# `requires-python` in pyproject.toml. Bump both together with the lock.

FROM ghcr.io/astral-sh/uv:0.11.23 AS uv

FROM python:3.14-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY --from=uv /uv /uvx /bin/

# Dependencies first, so a source change does not reinstall the world. `--locked`
# refuses to build if uv.lock disagrees with pyproject.toml. The project itself
# is not installed: it is a source tree run from /app, not a wheel.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

# Non-root. The uploads directory is the only path the API writes to; the named
# volume copies this ownership on first mount.
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home /app --shell /usr/sbin/nologin app \
 && mkdir -p /var/lib/resors/uploads \
 && chown app:app /var/lib/resors/uploads
USER app

EXPOSE 8000

# Liveness only (the API's /health). Readiness, which would also check the
# database, is not built yet (docs/ARCHITECTURE.md §10).
# --no-access-log: the application writes one structured access line per request
# (app/core/request_context.py), so uvicorn's plain-text duplicate is switched off.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
