# OPERATOR GUIDE — minimum-token Claude Code workflow

## Initial setup
Place this pack at the root of your new repository. It **contains `BIG-PROMPT.txt` itself** — the verbatim requirements text, source of every `BP-x.y` citation, so no session has to leave the project to read it (the archive original at `D:\RESORS_REFERENCE\BIG-PROMPT.txt` stays as the audit record; see `docs/REPOSITORY_AUDIT.md` §7). The QTC360 source is a reference only, read from the extracted tree at `D:\QTC360\qtc360\` (the archive `D:\RESORS_REFERENCE\qtc360-main.zip` is the audit record). Do not tell Claude to inspect a path that is not present.

Start Claude Code in the repository root. First instruction:

```text
Read CLAUDE_MASTER.md, DECISIONS.md, NEXT_PROMPT.md and task F001 in TASKS.md.
Implement F001 only. Follow the one-task protocol and stop.
```

Subsequent instruction (replace ID):

```text
Execute F002 only. Read only the relevant spec and source files.
Commit the completed task, including the updated NEXT_PROMPT.md handoff. Do not push. Do not start F003. Give me focused operator checks.
```

At every handoff: (1) inspect the commit and its diff, (2) run the commands Claude lists, (3) fix failures in a dedicated repair task, (4) review the agent's commit for the task (the agent commits each task itself — C13), (5) update decision statuses when needed, (6) request the next task. Do not ask Claude to explain the whole system every time.

## Running the checks and test suites (operator — `DECISIONS.md` C14)

**You run all whole-suite and gate checks. The agent supplies the commands and never reports their results.**
This table is the runbook; it grows as tasks create each suite. Anything marked *not available* has no runner
until its owning task lands — the agent must say so rather than hand you a command that cannot work.

| Check | Command | Available |
|---|---|---|
| Working tree | `git status --short` / `git diff --check` | now |
| Frontend types | `cd frontend && pnpm run typecheck` | **live (F006)** |
| Frontend build | `cd frontend && pnpm run build` | **live (F006)** |
| Frontend dev server | `cd frontend && pnpm run dev` → http://localhost:5173 | **live (F006)** |
| Backend API dev server | `cd backend && uv run uvicorn app.main:app --reload --port 8000` → http://localhost:8000/api/v1/health | **live (F007)** |
| Frontend lint / format | `cd frontend && pnpm run lint` / `pnpm run format:check` | **live (F055)** |
| Frontend unit + component (Vitest) | `cd frontend && pnpm test -- --run` | first tests F011; suite **live (F055)** |
| Frontend coverage | `cd frontend && pnpm run coverage` | **live (F055)** — thresholds in `vite.config.ts`; exit 0 means both were met |
| Backend lint / format (Ruff) | `cd backend && uv run ruff check . && uv run ruff format --check .` | F056 |
| Backend types | `cd backend && uv run mypy app` | F056 |
| Backend unit tests | `cd backend && uv run pytest -q` | first tests F023; suite F056 |
| Backend integration (real Postgres) | `docker compose up -d postgres && cd backend && uv run pytest tests/integration -q` | F008 + F056 |
| Migration smoke | `cd backend && uv run alembic upgrade head` then `alembic downgrade base` | F023 |
| Dev database at head | `cd backend && uv run alembic current` → expect `(head)` | now — see the note below |
| Browser E2E (Playwright) | `cd frontend && pnpm exec playwright test` | F057 |
| Accessibility (axe) | `cd frontend && pnpm run test:a11y` | F058 |
| PDF / Gotenberg smoke | `cd backend && uv run pytest tests -q -k report` | F052 |
| Production compose | `docker compose -f docker-compose.prod.yml up --build` | F059 |

**At a gate**, the agent hands you the exact subset for that gate (see the gate list below) rather than the
whole table. Never assume a check passed until you ran it; the agent must not claim it did.

**Keep the dev database at head.** A new migration is exercised on `app_test` when it lands, but `app_dev` only
moves when someone upgrades it — so a table the backend starts reading can be missing from your running server
while every test is green. That happened after F050: `app_dev` sat at `0008`, `file_assets` arrived in `0009`,
and the first page to call `GET /api/v1/files` (F054's lab) returned a 500 rather than an empty list. The fix is
one line — `cd backend && uv run alembic upgrade head` — and the habit that prevents it is running
`alembic current` after any migration task. Do not run `alembic downgrade base` against `app_dev`: the
downgrade-to-base leg belongs to `app_test` (F023's smoke), never to the database you browse.

## Gates
- G-A1 after F016: UI app boots, design tokens/components and navigation work.
- G-A2 after F032: PostgreSQL migrations, authentication, RBAC and privilege checks pass.
- G-A3 after F048: real admin pages, preferences, audit and notifications pass.
- G-A4 after F063: foundation release-ready, no domain code, production-like smoke test.
- G-B1 after D018: master data and rate history validated.
- G-B2 after D036: tender and awarded forecast/revision system verified.
- G-B3 after D063: actual assignments, transfer, leave and employee lifecycle verified.
- G-B4 after D078: cost-at-completion and consolidated capacity verified.
- G-B5 after D091: business reports, security, tests and release readiness verified.

## Context economy
Use one task per Claude session or a small number of consecutive sessions with context reset as needed. Keep only relevant sections open. `NEXT_PROMPT.md` is the authoritative handoff and compact checkpoint; archive logs to `docs/`. Prefer focused tests and explicit operator commands. Avoid generating repeated architecture essays, redundant summaries, long chain-of-thought, screenshots unless needed, and broad reformatting.

## Handling changes
When you decide a business rule, update `DECISIONS.md` first and have Claude add its acceptance tests. If a feature is larger than one small task, add subtask IDs (e.g. `D042a`) rather than combining many files and concerns. If requirements change, amend spec and tests before changing code.
