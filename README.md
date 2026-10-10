# resors — domain-neutral enterprise foundation

A production-ready web application foundation: authentication with server-side authorization,
multi-role RBAC, an admin area (users, roles, permission dictionary, settings, audit trail),
a notification centre, own profile and preferences, private file storage, PDF/DOCX reporting and
a typed API client — on React + Vite + FastAPI + PostgreSQL, deployable with Docker Compose and Caddy.

**Scope of this stage.** The repository implements the *foundation* only (`claude_code_pack/TASKS.md`
Stage A, F001–F063). No construction-domain code exists here by design: business modules arrive in
Stage B against the extension contract in [`docs/ADDING_A_MODULE.md`](docs/ADDING_A_MODULE.md).
There is no Next.js and no Redis anywhere, no public sign-up, and no seeded production credential.

Documentation map: [`docs/`](docs/) — see the table at the end of this file.

## Stack

Frontend React 19 + Vite + React Router + Tailwind CSS 4 + TanStack Query/Table + React Hook Form + Zod,
package-managed with **pnpm**. Backend FastAPI + async SQLAlchemy 2 + Alembic + Pydantic 2 on
**uv**, with PostgreSQL, Gotenberg (Word→PDF) and ReportLab. Caddy serves the built SPA and
reverse-proxies the API in production.

Versions are pinned in the manifests, not here — read `frontend/package.json`, `frontend/pnpm-lock.yaml`,
`backend/pyproject.toml` and `backend/uv.lock`. The evidence behind each pin (and every deliberate
deviation from latest) is [`docs/STACK_VERSIONS.md`](docs/STACK_VERSIONS.md).

## Requirements

| Tool | Version | Note |
|---|---|---|
| Docker + Compose | current | PostgreSQL, and Gotenberg for Word conversion |
| Node | **24 or newer** | `frontend/package.json` `engines` |
| pnpm | **12.9.1** | pinned by `packageManager`; `corepack enable` provides it |
| uv | current | runs and locks the backend |
| Python | **3.14 or newer** | `backend/pyproject.toml` `requires-python`; uv installs it |

## Quick start (clean machine, development)

Commands are shown for a POSIX shell (Git Bash on Windows, a Linux/macOS terminal). On PowerShell,
`cp` is `Copy-Item` and `&&` does not chain.

```bash
# 1. Configuration. .env is git-ignored and never committed.
cp .env.example .env                     # then replace every placeholder

# 2. Development services: PostgreSQL (and Gotenberg).
docker compose up -d --wait              # wait for "Healthy"

# 3. Schema. Migrations are explicit — the application never migrates on startup.
cd backend
uv run alembic upgrade head
uv run alembic current                   # expect "<head revision> (head)"

# 4. The one-time super-admin. There is no default credential: without a password
#    source the command refuses and writes nothing.
uv run python -m app.bootstrap_admin --email admin@example.com --generate-password
#    The generated password is printed exactly once. Record it in the git-ignored
#    LOCAL_CREDENTIALS.md, then remove BOOTSTRAP_ADMIN_PASSWORD from .env if used.
```

Run the two development servers, each in its own terminal:

```bash
cd backend  && uv run uvicorn app.main:app --reload --port 8000   # http://localhost:8000/docs
cd frontend && pnpm install && pnpm run dev                       # http://localhost:5173
```

The SPA calls the relative `/api/v1`, which Vite proxies to port 8000 — same origin, no CORS.
`.env` lives at the repository root. If 5432 (or 3100) is already taken by another project, change
`POSTGRES_PORT` / `GOTENBERG_PORT` in `.env` and, for the converter, `GOTENBERG_URL` to match.

Once the bootstrapped account signs in it must change its password before it can reach anything
else; further accounts are created in **Administration → Users** like any other.

## Everyday commands

| Task | Command |
|---|---|
| Start DB + converter | `docker compose up -d --wait` |
| Stop, keep data | `docker compose down` |
| Wipe local data | `docker compose down -v` |
| Apply migrations | `cd backend && uv run alembic upgrade head` |
| Serve the API | `cd backend && uv run uvicorn app.main:app --reload --port 8000` |
| Serve the SPA | `cd frontend && pnpm run dev` |
| Frontend unit/component tests | `cd frontend && pnpm run test:run` |
| Backend tests (no database) | `cd backend && uv run pytest -m "not integration"` |
| Backend tests (needs the container) | `cd backend && uv run pytest` |
| Browser end-to-end suite | `cd frontend && pnpm exec playwright test` |

The full test matrix — every suite, marker, coverage floor and gate command — is
[`docs/TESTING.md`](docs/TESTING.md).

## Build

```bash
cd frontend && pnpm run build        # tsc --noEmit && vite build → frontend/dist/
```

The production bundle contains no developer-only surface: the component lab and its charting
dependencies are excluded by the module graph (verify with a search of `dist/`, per `docs/TESTING.md`).

## Production deploy

The production stack is `docker-compose.prod.yml` — Caddy (the only published service), the built
SPA, the API, PostgreSQL and Gotenberg on an internal network.

```bash
cp .env.production.example .env.production    # real values; git-ignored
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
  backend python -m app.bootstrap_admin --generate-password
```

Every secret and the public domain come from `.env.production`; a missing value stops Compose
before any container starts, and the API refuses to boot in production with a placeholder, weak or
loopback configuration. Step-by-step prerequisites, migration handling, updates, rollback, logs and
the no-downtime caveats are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Backup and restore

Nothing is backed up automatically. [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md) is the
procedure: an encrypted `pg_dump` of the database, the private uploads volume, the Caddy certificate
volumes and `.env.production`, a retention plan, and the restore smoke test. Read that document
before relying on any backup: **the procedure has not yet been executed end to end.**

## Documentation

| Document | What it is |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System context, topology, session model, backend/frontend structure, extension boundaries |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Production topology, first deploy, migrations, bootstrap, updates, rollback, logs |
| [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md) | Backing up and restoring the database, uploads and configuration |
| [`docs/TESTING.md`](docs/TESTING.md) | Test layers, exact commands, coverage gates, CI jobs |
| [`docs/ADDING_A_MODULE.md`](docs/ADDING_A_MODULE.md) | The extension contract, with a worked example |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Session strategy, password/permission policy, CSRF, threat model |
| [`docs/ROUTES_NAVIGATION.md`](docs/ROUTES_NAVIGATION.md) | Screens, permission visibility, route states |
| [`docs/OPENAPI_CLIENT.md`](docs/OPENAPI_CLIENT.md) | The OpenAPI → typed-client pipeline and its drift check |
| [`docs/STACK_VERSIONS.md`](docs/STACK_VERSIONS.md) | Exact installed versions and the evidence for each |
| [`docs/REFERENCE_PARITY.md`](docs/REFERENCE_PARITY.md) | Reference → target matrix: what was kept, adapted or excluded, and why |
| [`docs/REQUIREMENT_TRACEABILITY.md`](docs/REQUIREMENT_TRACEABILITY.md) | Requirement → module → task index, and the remaining gaps |
| [`docs/VERIFICATION_LOG.md`](docs/VERIFICATION_LOG.md) | Commands you can run today and what to expect |
| [`docs/IMPLEMENTATION_LOG.md`](docs/IMPLEMENTATION_LOG.md) | Gate evidence ledger |
| [`claude_code_pack/`](claude_code_pack/) | The engineering pack: protocol, backlog, decisions, operator runbook |

## Not in this repository

No construction/QA-QC/commissioning domain logic, no Next.js, no Redis, no public registration, no
demo credentials, no fake data. One legal entity, AED only. The reasoning behind each exclusion is in
[`docs/REFERENCE_PARITY.md`](docs/REFERENCE_PARITY.md) and `claude_code_pack/BIG-PROMPT.txt` §3.
