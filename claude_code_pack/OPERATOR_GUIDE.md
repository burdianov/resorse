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
| Frontend unit + component (Vitest) | `cd frontend && pnpm run test:run` | first tests F011; suite **live (F055)** — `pnpm test` is the watch mode, `pnpm run coverage` the same run under coverage |
| Frontend coverage | `cd frontend && pnpm run coverage` | **live (F055)** — thresholds in `vite.config.ts`; exit 0 means both were met |
| Backend lint / format (Ruff) | `cd backend && uv run ruff check . && uv run ruff format --check .` | **live (F056)** — applied migrations are excluded from `format` only (they are frozen); `check` lints them |
| Backend types (mypy strict) | `cd backend && uv run mypy` | **live (F056)** — covers `app`, `tests` and `scripts`; the file list is in `[tool.mypy]`, so the bare command *is* the gate |
| Backend unit tests (no database) | `cd backend && uv run pytest -m "not integration" -q` | **live (F056)** — runs anywhere; this is the leg that needs no PostgreSQL |
| Backend integration (real Postgres) | `cd backend && uv run pytest -m integration -q` | **live (F056)** — needs `docker compose up -d --wait` first, and **fails** rather than skipping if no database is configured |
| Backend whole suite (both legs) | `cd backend && uv run pytest -q` | first tests F023; both legs **live (F056)** |
| Backend coverage gate | `cd backend && uv run python -m scripts.coverage_gate` | **live (F056)** — runs the whole suite under branch coverage, then enforces three floors; exit 0 means all three were met |
| Migration smoke | `cd backend && uv run alembic upgrade head` then `alembic downgrade base` | F023 |
| Dev database at head | `cd backend && uv run alembic current` → expect `(head)` | now — see the note below |
| Browser E2E (Playwright) | `cd frontend && pnpm exec playwright test` | **live (F057)** — see the note below: it needs the Postgres container up and the browser installed |
| Accessibility (axe) | `cd frontend && pnpm run test:a11y` | **live (F058)** — see the note below: needs Postgres and Chromium, and it runs the workflow first. Fourteen axe scans over nine screens (five of them in both themes), WCAG 2.2 A/AA, failing on `critical` **and** `serious`, no rule suppressed |
| Visual baselines | `cd frontend && pnpm run test:visual` | **live (F058)** — see the note below. 94 committed baselines; a diff fails the run and lands in `frontend/test-results/` |
| PDF smoke (F051 engine + F053 export) | `cd backend && uv run pytest tests -q -k report` | **live (F051/F053)** — the report PDF is rendered **in-process** by ReportLab, so this needs no Gotenberg |
| DOCX conversion (Gotenberg adapter) | `cd backend && uv run pytest tests -q -k conversion` | **live (F052)** — the adapter's healthy/unavailable paths are mocked, so the container is not required. The one **live** conversion test is opt-in: `docker compose up -d --wait gotenberg` and set `RESORS_LIVE_GOTENBERG=1`, otherwise it skips. |
| Production compose | `docker compose -f docker-compose.prod.yml up --build` | F059 |

**At a gate**, the agent hands you the exact subset for that gate (see the gate list below) rather than the
whole table. Never assume a check passed until you ran it; the agent must not claim it did.

**The browser suite (F057) needs two things first.** `docker compose up -d --wait postgres` — it builds its own
database (`app_e2e`) on that server, and there is no way to point it at `app_dev`; and
`cd frontend && pnpm exec playwright install chromium` once per machine (Chromium build **1248**, matching
`@playwright/test` 1.64.0). It starts its own API on **8001**, dev server on **5174** and a `vite preview` of the
real `dist/` on **4174**, so it never touches a stack you have running on 8000/5173 — but it does build the
frontend, so a run takes a couple of minutes before the first spec executes. Credentials are generated per run
into `frontend/tests/e2e/.state/` (git-ignored); it never reads `.env` or `LOCAL_CREDENTIALS.md`. A run leaves its
evidence behind: `frontend/playwright-report/` holds the HTML report and `frontend/test-results/` the failure
screenshots. Both are git-ignored and excluded from `format:check`.

**The accessibility and visual suites (F058) need the same two things as the browser suite**, and for the
same reason: `docker compose up -d --wait postgres` and `pnpm exec playwright install chromium`. They are two
more files in the same Playwright project — `pnpm run test:a11y` makes fourteen axe scans (nine screens, five of
them in both themes), `pnpm run test:visual` compares 94 screenshots — and the config makes both **depend on the
workflow**, so either command runs `workflow.spec.ts` first and a broken workflow skips the scans rather than
reporting green scans of a broken app. Expect the frontend build first, then roughly 2.5 minutes of specs per
command: F058 observed `pnpm run test:visual` between **3.3 and 4.3 min for 105 tests**, depending on how loaded the
machine is, and a bare `pnpm exec playwright test` — the gate row — runs all three files and takes about twice that.
Like it, they build their own database (`app_e2e`) on every invocation, so a run begins at the workflow's beginning
rather than on top of whatever the last run left behind.

**A visual difference is meant to be looked at, not re-pinned.** The baselines are committed PNGs
(`frontend/tests/e2e/visual.spec.ts-snapshots/`), the tolerance is `maxDiffPixels: 0`, and a failing run writes
the actual, expected and diff images into `frontend/test-results/` — read the diff before deciding anything.
When a change to the interface is intended, re-pin and then **prove it**: `pnpm run test:visual:update` writes
whatever the app currently shows (including anything unstable it happens to catch), and the `pnpm run
test:visual` you run afterwards is the run that says the new baselines are stable. A baseline that only ever
passes on the machine that wrote it is a recording, not a baseline. Two states are dimension-bound on purpose:
the sidebar has no collapsed form at 390px, so `dashboard-collapsed` does not exist there and
`dashboard-nav-drawer` takes its place.

**Two things outlive a navigation, and both caught F058's baselines.** The sidebar's stored preference
(`app.sidebar` in `localStorage`) beats the viewport default, so a state photographed after some other state
moved the rail keeps that arrangement — and at 900px, where the app itself opens collapsed, that inheritance is
the only reason the rail would be open at all: the two restricted-account states were pinned collapsed by the
app's own tablet default and photographed expanded by a run that had stored a preference earlier. And the inbox
accumulates: the only way these specs can obtain a session that is not the administrator's is to reset a filler
account's password through the API, and every reset leaves one more notice behind. Neither shows up while a run
passes —
Playwright restarts a worker after any failure, re-running the suite's setup, so the *first* failure is
reproduced again and again with a slightly different image each time (F058 measured **31 password resets
against the 30 failures of one full run**). A state is therefore *arranged* — the sidebar is clicked into
place, the inbox is trimmed to the one notice the run just caused — and never inherited from whatever the run
happened to do first.

**Keep the dev database at head.** A new migration is exercised on `app_test` when it lands, but `app_dev` only
moves when someone upgrades it — so a table the backend starts reading can be missing from your running server
while every test is green. That happened after F050: `app_dev` sat at `0008`, `file_assets` arrived in `0009`,
and the first page to call `GET /api/v1/files` (F054's lab) returned a 500 rather than an empty list. The fix is
one line — `cd backend && uv run alembic upgrade head` — and the habit that prevents it is running
`alembic current` after any migration task. Do not run `alembic downgrade base` against `app_dev`: the
downgrade-to-base leg belongs to `app_test` (F023's smoke), never to the database you browse.

## Gates

### Running a gate

`claude_code_pack/TASKS.md` §Gate checkpoints names the gates; **you** run them, and the agent must not advance
across one automatically. The commands are the table above — the gate's job is to run *all* of them plus the
browser walkthrough, in this order, against a **pinned tree**:

1. **Pin the tree.** `git -C D:\resors log -1 --format="%h %s"` and `git status --short` (clean). A gate result
   against an unknown tree proves nothing; write the hash into the entry.
2. **Preconditions.** `docker compose up -d --wait` (Postgres healthy); `cd backend; uv run alembic current` →
   **`(head)`** — whatever revision that is on the day, never a number copied from a document (a dev database
   behind head serves 500s while every test is green); from F057 the browser suite
   also needs `cd frontend; pnpm exec playwright install chromium` once per machine.
3. **Static checks, then the suites, then the browser suite** — the table's rows in their own order: lint,
   `format:check`, `typecheck`, `build` (+ the dev-only-exclusion search of `dist/`), Ruff, mypy; then Vitest,
   coverage, the backend suite (**both legs** — the integration leg and the coverage gate *fail* rather than skip
   with no database), the coverage gate, and `pnpm exec playwright test`; then OpenAPI drift and the migration
   round trip **on `app_test` only**. Never run `downgrade base` against `app_dev`.
4. **The browser walkthrough.** No command covers the phase's own scope — for G-A3 that is the real admin pages,
   profile, preferences, the full DataTable, the denial checks (a non-admin gets 403 in-app and from the API, and
   the forced-change state answers 403 until the password is changed) and the route states (404 inside the shell,
   403 page, offline with Retry). Judge table preferences and role grants **by reloading**, never by a banner.
5. **Record it in `docs/IMPLEMENTATION_LOG.md`** — date, commit hash, commands with observed results, the
   walkthrough's outcome, and the verdict. A red item becomes a fix task and the gate is re-run after it lands;
   nothing is waived into the record, and counts are written as observed, never quoted from `NEXT_PROMPT.md`.

Before G-A3, the item that sat inside its scope has been decided, **owned and fixed**: the roles-screen re-seed
defect is `TASKS.md` **F064** (operator, 2026-10-10, C59), and F064 has landed — the guide's rule was met by
implementing F064, not by walking the gate around it. F058 owned the accessibility findings F057 recorded
and has closed them in application code (C46) — the palette's misplaced `sr-only` header, the breadcrumb separator
nested inside an item, the three `Button render={<Link/>}` navigations, and the `DataTable` columns whose
view-options menu printed a raw id.

### The gates
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
