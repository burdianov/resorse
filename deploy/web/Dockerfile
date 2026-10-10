# syntax=docker/dockerfile:1
#
# The public edge (F059, BIG-PROMPT §11.2): the Vite SPA built here, served as
# static files by Caddy, which also reverse-proxies /api to the backend. Built
# from the repository root because the build needs frontend/ and the Caddyfile
# lives under deploy/; the root .dockerignore keeps the context small and keeps
# .env and LOCAL_CREDENTIALS.md out of it.
#
# Pins: Node is the frontend's engines floor (>=24); pnpm comes from the
# packageManager field via corepack, so it is not pinned here twice; Caddy is
# the version STACK_VERSIONS.md §6 records.

FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable

# Lockfile first so dependency installation is cached across source edits.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
# `build` runs tsc --noEmit, then vite build. No VITE_* variable is needed: the
# SPA calls the relative /api/v1 and Caddy makes that same-origin.
RUN pnpm run build

FROM caddy:2.11.7-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
