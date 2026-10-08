# OPERATOR GUIDE — minimum-token Claude Code workflow

## Initial setup
Place this pack at the root of your new repository alongside the original `BIG-PROMPT.txt` (optional after reference audit) and the QTC360 source ZIP if you possess it. The attached text refers to `qtc360-main(2).zip`, but its presence has **not** been verified here. Do not tell Claude to inspect a missing ZIP.

Start Claude Code in the repository root. First instruction:

```text
Read CLAUDE_MASTER.md, DECISIONS.md, STATE.md and task F001 in TASKS.md.
Implement F001 only. Follow the one-task protocol and stop.
```

Subsequent instruction (replace ID):

```text
Execute F002 only. Read only the relevant spec and source files.
Do not commit, do not start F003, and give me focused operator checks.
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
| Frontend lint / format | `cd frontend && pnpm run lint` / `pnpm run format:check` | F055 |
| Frontend unit + component (Vitest) | `cd frontend && pnpm test -- --run` | first tests F011; suite F055 |
| Frontend coverage | `cd frontend && pnpm run coverage` | F055 |
| Backend lint / format (Ruff) | `cd backend && uv run ruff check . && uv run ruff format --check .` | F056 |
| Backend types | `cd backend && uv run mypy app` | F056 |
| Backend unit tests | `cd backend && uv run pytest -q` | first tests F026; suite F056 |
| Backend integration (real Postgres) | `docker compose up -d postgres && cd backend && uv run pytest tests/integration -q` | F008 + F056 |
| Migration smoke | `cd backend && uv run alembic upgrade head` then `alembic downgrade base` | F023 |
| Browser E2E (Playwright) | `cd frontend && pnpm exec playwright test` | F057 |
| Accessibility (axe) | `cd frontend && pnpm run test:a11y` | F058 |
| PDF / Gotenberg smoke | `cd backend && uv run pytest tests -q -k report` | F052 |
| Production compose | `docker compose -f docker-compose.prod.yml up --build` | F059 |

**At a gate**, the agent hands you the exact subset for that gate (see the gate list below) rather than the
whole table. Never assume a check passed until you ran it; the agent must not claim it did.

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
Use one task per Claude session or a small number of consecutive sessions with context reset as needed. Keep only relevant sections open. Use `STATE.md` as compact checkpoint; archive logs. Prefer focused tests and explicit operator commands. Avoid generating repeated architecture essays, redundant summaries, long chain-of-thought, screenshots unless needed, and broad reformatting.

## Handling changes
When you decide a business rule, update `DECISIONS.md` first and have Claude add its acceptance tests. If a feature is larger than one small task, add subtask IDs (e.g. `D042a`) rather than combining many files and concerns. If requirements change, amend spec and tests before changing code.
