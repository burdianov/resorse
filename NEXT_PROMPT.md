# NEXT SESSION PROMPT — resors

> **Authoritative current-session handoff** for `D:\resors` — the single cold-start file. It replaces the earlier
> 1,852-line version (`git show ce8b703:NEXT_PROMPT.md`); archived sections live in `docs/`. `STATE.md` points here.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md, NEXT_PROMPT.md and task F057
in claude_code_pack/TASKS.md. Implement F057 only, following the one-task protocol: plan in at most
five bullets, implement, run focused checks, update NEXT_PROMPT.md, commit the task including the handoff, then stop and give
me the operator checks. Do not push. Do not start F058.
```

## 2. Current position

- **Stage A — domain-neutral foundation** (F001–F063). Stage B (D001–D091, construction domain) has not started.
- **Last completed:** F056 — Backend quality gate (full record: **C44**, `ARCHITECTURE.md` §4). Four commands, one job
  each, mirroring F055's four: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy` (strict over
  **`app` + `tests` + `scripts`**, the file list in `[tool.mypy]` so the bare command *is* the gate), and
  `uv run python -m scripts.coverage_gate`. The suite split into **two legs by one marker**: `-m "not integration"`
  runs anywhere (168 passed, 2 skipped, 264 deselected), `-m integration` is the real-Postgres leg — and
  `tests/conftest.py` now **fails instead of skipping** with no database configured, because "every database test
  skipped, exit 0" was a green light with nothing behind it; `tests/test_markers.py` guards the partition both ways.
  Coverage is a script, not `fail_under`, because BP-10.5 asks for groups and coverage.py enforces one number:
  **core 96.72%** (`app/core` + `app/services`, floor **85** — BP's own number), **auth_rbac 97.34% branches** (13
  named auth/RBAC modules, floor **97**), **total 95.64%** (2742 stmts, floor **95**). Whole suite: **432 passed,
  2 skipped in 30.02 s**.
- **Previous tasks:** F055 — Frontend quality gate + its follow-up (C43); F054 — **`ab3c11a`** (C42); F053 — `cbad877` (C41).
- **Next: F057 — Browser E2E.** TASKS.md ~line 233: "Playwright auth/admin/theme/notification/report flows"; the accept
  is "Real DB browser tests". It needs both servers *and* a real browser, so the focused check is a single spec and the
  full browser run belongs to the operator.
- **Gates:** F016, F032, F047 and F048 are complete; operator gate results are **not recorded in this handoff**.
  **G-A3 (after F048) is due and is the operator's to run** (`OPERATOR_GUIDE.md`, "Gates"); then **G-A4, after F063**.
- **Blockers:** none recorded.
- **Open decisions (DECISIONS.md):** **O01–O18 remain OPEN** — Stage B business rules (working-day calendar, rate changes
  within a month, revision semantics, and others). None blocks F057; never treat one as approved, and if a task depends
  on one, stop and ask one precise question. Confirmed: C11–**C44** (C44 is F056's).
- **Standing habit — keep `app_dev` at head.** Migrations are exercised on `app_test`, so a table a new page reads can
  be missing from the running server while every test is green (it happened after F050). Run `alembic current` after any
  migration task; it reads `0009 (head)` today.
- **Open item — `/ready` is not built (BP-8.4b):** `conversion.health()` belongs behind it, but no readiness route
  exists — F053's `reports/engine-health` answers a different question. Read `health()`, don't re-implement it.
- **Open item — orphan objects:** an object is unlinked only *after* the caller's commit (and when it raises), so the
  residue is a process death in between. No scheduler exists, so no sweep is built; never unlink before commit.
- **Open item — nothing scans uploads yet:** BP-6.4's hook ships as `MalwareScanner` + `NoMalwareScanner` (the name is
  the disclosure), nothing is wired in, and the API answers 400 if one ever refuses — never call uploads scanned.

## 3. Essential constraints

Full text is in `docs/CARRIED_CONSTRAINTS.md`. The rules below apply to every task.

- **Commit** each completed task (C13); **never push**, deploy, or make irreversible data changes. **The operator runs
  all whole-suite and gate checks** (C14) — give exact commands with expected outcomes, never report a suite you did
  not run yourself.
- **Authorization is server-side.** New endpoints use `current_session` (never `authenticated_session` unless the
  route is on the auth router's exemption list). Privileged data uses `require_permission(PermissionCode.X)`.
- **Forced-password-change gate:** `current_session` returns **403** ("Your password must be changed before
  continuing.") while `must_change_password` is set. Only the auth exemption list is reachable during that state.
- **Toast policy:** a cold query failure renders inline (`ErrorState`). A background query failure and a failed
  mutation use toast notifications. Do not unify the two (`docs/OPENAPI_CLIENT.md` §4).
- **API changes:** regenerate `backend/openapi.json` and `frontend/src/lib/generated/`. Never hand-edit generated
  files. Call the API only through `frontend/src/lib/api.ts`.
- **Query keys** for user-scoped data include the user id. Do not add a second poller for the unread count.
- **Schema changes** need a migration. Never edit an applied migration. Never run `alembic downgrade base` against
  `app_dev`; scratch tests use `app_test`.
- **Money and rates:** PostgreSQL NUMERIC / Python `Decimal`, never floats. Dates: UAE display; UTC instants for events.
- **Pages:** one `RouteDefinition` in `frontend/src/config/navigation.ts`. Never register a page that does not exist.
- **Audit:** every new service mutation calls `audit.record` inside its transaction. Inbox operations are excluded (C34).
- **Scope:** Stage A adds no construction domain code. One legal entity, AED only.
- **Approved version deviations — do not upgrade:** TypeScript **6.0.3** and jsdom **29.1.1**. Rationale is in
  `docs/STACK_VERSIONS.md` §5 and `docs/CARRIED_CONSTRAINTS.md` §6.
- **Not allowed:** Redis, Next.js, public signup, seeded production passwords, inert buttons, fake data.
- **Windows scripted writes** can insert control bytes; after one, run the check in `docs/CARRIED_CONSTRAINTS.md` §6.
- **Credentials:** never read or print `LOCAL_CREDENTIALS.md`, `.env` values, or any password.

## 4. Environment

Verify versions against the configuration files, not this list: `frontend/package.json` (Node `>=24`, pnpm 12.9.1
pinned), `backend/pyproject.toml` (Python `>=3.14`), `backend/uv.lock`, `frontend/pnpm-lock.yaml`.

Start the services, each in its own terminal:

| Service | Command | Expected |
|---|---|---|
| Database | `cd D:\resors; docker compose up -d --wait` | `resors-postgres ... Healthy`, port 5432 |
| Converter | same command (F052 added it to that file) | `resors-gotenberg ... Healthy`, port `${GOTENBERG_PORT:-3100}` → 3000. Only reports need it; the API starts and runs without it |
| Frontend | `cd D:\resors\frontend; pnpm run dev` | `VITE ... ready` → http://localhost:5173 |
| Backend | `cd D:\resors\backend; uv run uvicorn app.main:app --reload --port 8000` | `Application startup complete` → http://localhost:8000/docs |

- The frontend calls relative `/api/v1`; Vite proxies it to port 8000 (same-origin, no CORS). `.env` sits at the
  repository root and is git-ignored.
- **Port clash:** other local projects also publish 5432 (and possibly 3100). Change `POSTGRES_PORT` /
  `GOTENBERG_PORT` in `.env` to run side by side — and change `GOTENBERG_URL` with the converter's port.

## 5. Open item (unresolved, linked to F057)

**jsdom `Select` rendering.** An uncontrolled `Select` shows the raw value (`site`) not the label (`Site`) and leaves
the listbox mounted — possibly a layout-less artefact, so tests neither assert nor forbid it. **Check in a browser at F057.**

## 6. Testing and quality gates

**Focused checks** (the agent runs these and reports observed results):
- Frontend: `cd D:\resors\frontend; pnpm exec vitest run <touched test files>`, `pnpm run typecheck`,
  `pnpm run lint <paths>`, `pnpm run format:check <paths>`; backend: `cd D:\resors\backend; uv run pytest <touched
  files>`, `uv run ruff format --check <files>`, `uv run ruff check <files>`, `uv run mypy <files>`.
- **Mark a new backend test with `integration` iff it reaches the database** — `tests/test_markers.py` fails in both
  directions, so a database test without the marker and a marked test without a database fixture are both red.
  `uv run pytest -m "not integration"` is the leg that proves the rest still runs with no database.
- If the API contract changed: `cd D:\resors\backend; uv run python -m scripts.export_openapi`, then
  `cd D:\resors\frontend; pnpm run api:types`. Both committed artefacts must be byte-stable apart from the task's own diff.
- Dev-only surface (F054's rule): `pnpm run build`, then search `dist/` for a lab-only string or the route path — a
  match means the exclusion failed. Never infer it from the `import.meta.env.DEV` ternary.
- Lint only what you touched; whole-repo `pnpm run lint`/`format:check`/`coverage` and — from F056 — bare
  `uv run ruff check .`/`ruff format --check .`/`mypy` are **gate checks**. Never relax a threshold to pass one.

**Gate checks** (the operator runs these; the agent supplies the commands and never reports their results):
frontend → `pnpm run lint`, `format:check`, `typecheck`, `build`, `pnpm exec vitest run`, `pnpm run coverage`;
backend → `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (both legs),
`uv run python -m scripts.coverage_gate`. Non-zero means a missed threshold, a red suite, or a group below its floor.

**Gaps:** none outstanding in either gate. The frontend's `typecheck` covers `tests/` (F055 follow-up); the backend's
two legs are selected and checked by marker, and its two database-dependent checks **fail** rather than skip — start
the container, don't run the other leg and call it a gate.

**Not yet available:** Playwright E2E (F057), axe (F058), production Compose (F059) — do not hand these to the operator
as runnable until their task lands. **Test counts are historical**: report the count you observe.

## 7. Operator verification commands

Run these before F057 starts. The record column is **historical and the agent's own observation**, never the operator's gate result.

| Check | Command | Record (F056 unless marked) |
|---|---|---|
| Working tree & HEAD | `git -C D:\resors status --short`; `git -C D:\resors log -1 --format="%h %s"` | clean after the commit; HEAD = `feat(F056): backend quality gate`, implementation and handoff in the same commit |
| Backend format | `cd D:\resors\backend; uv run ruff format --check .` | `98 files already formatted` — applied migrations are excluded from the formatter by config (a diff in `migrations/versions/*.py` must be byte-identical, not formatted) |
| Backend lint | `cd D:\resors\backend; uv run ruff check .` | `All checks passed!` |
| Backend types | `cd D:\resors\backend; uv run mypy` | `Success: no issues found in 97 source files` — the file list is in `[tool.mypy]`, so the bare command covers `app`, `tests` and `scripts` |
| Backend suite, no database | `cd D:\resors\backend; uv run pytest -m "not integration"` | 168 passed, 2 skipped, 264 deselected in 1.09 s. The two skips are conditional, **not** database ones: the live Gotenberg test and the symlink test on this platform |
| Backend suite (both legs) | `cd D:\resors\backend; uv run pytest` | **a gate check.** Run by the agent inside the coverage gate: **432 passed, 2 skipped in 30.02 s**, needing `docker compose up -d --wait` first |
| Backend coverage gate | `cd D:\resors\backend; uv run python -m scripts.coverage_gate` | exit **0**; `core` 25 files **96.72%** (floor 85), `auth_rbac` 13 files **97.34% branches** (floor 97), `total` 65 files / 2742 stmts / 96 miss / 516 branch / 38 brpart **95.64%** (floor 95) |
| Frontend lint / format | `cd D:\resors\frontend; pnpm run lint`; `pnpm run format:check` | **F055 record**: exit 0 / `All matched files use Prettier code style!` |
| Frontend typecheck / coverage | `pnpm run typecheck`; `pnpm run coverage` | **F055 record**: exit 0 over **`src` and `tests`**; 67 files / **563** passed, All files **92.65 | 80.49 | 91.14 | 93.71**, `src/lib` **94.04 | 85.71 | 90.32 | 95.65** |
| **Dev-only exclusion** | `cd D:\resors\frontend; pnpm run build`, then search `dist/` for `Development builds only` / `recharts` / `tools/components` | **F055 record**: no match — the lab page and recharts are absent from `dist/`. A match means the exclusion broke |
| Frontend suite | `cd D:\resors\frontend; pnpm exec vitest run` | **a gate check. F055 record**: 563 passed (F047: 498) |
| OpenAPI drift | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | F056 changes no API. **F055 record**: re-run produced **no diff** |
| Dev database at head | `cd D:\resors\backend; uv run alembic current` | `0009 (head)`. Run this after any migration task — a dev database behind head serves 500s while every test is green |
| Migration round trip | `upgrade head` → `downgrade base` → `upgrade head` against **`app_test`** only (§3) | **not run by the agent** (F056 adds no migration). F049 record: clean, ending at `0009` |

**The end-to-end check (F054's).** In a **dev** build (`pnpm run dev`), signed in as an `admin`: the sidebar shows a
**Tools** group holding **Component Lab**, and `/tools/components` renders the primitives, the charts and the files
section — upload a real file, preview the text one, download it under the server's own name, delete it through the
confirm dialog. In a **production** build the same path must 404 (the build row above checks that without a browser).
By hand at `localhost:8000/docs`: F053's export (`/admin/users` → **Export PDF** → `user-directory-<date>.pdf`, the
1,000-row sentence) and F050's downloads (`nosniff`, `private, no-store`; a foreign file id → **404**).

## 8. Reference documents (read only the section a task needs)

| Document | Use |
|---|---|
| `claude_code_pack/CLAUDE_MASTER.md` | Protocol, stop conditions, operating lessons |
| `claude_code_pack/TASKS.md` | Backlog; F057 is at about line 233 |
| `claude_code_pack/DECISIONS.md` | Confirmed decisions C11–C44; open decisions O01–O18 |
| `claude_code_pack/PRODUCT_SPEC.md` | Functional contract; read only the needed sections |
| `claude_code_pack/OPERATOR_GUIDE.md` | Operator runbook and gate list |
| `docs/ARCHITECTURE.md` | §3 sessions, §4 backend (incl. the F056 quality gate), §5 frontend (incl. F055's), §6 authorization, §7 boundaries, §12 traps |
| `docs/REQUIREMENT_TRACEABILITY.md` | BP-x.y index (§1–§11) and §14 gaps |
| `docs/ROUTES_NAVIGATION.md`, `docs/OPENAPI_CLIENT.md` | Routing registry; typed-client recipe |
| `docs/STACK_VERSIONS.md` | Version pins, the lint/format toolchain (§3) and approved deviations (§5) |
| `docs/CARRIED_CONSTRAINTS.md`, `docs/ENVIRONMENT.md` | Archived §6 constraints; archived §4 environment snapshot |

**Do not load the four archives in full** — search them for the task ID. Use the `REQUIREMENT_TRACEABILITY.md` index rather than reading `BIG-PROMPT.txt` whole.

## 9. Handoff format

End every task with this block, then stop and wait for the operator:

```text
TASK: <ID> — <name>
STATUS: DONE | PARTIAL | BLOCKED
FILES: <paths>
CHECKS RUN: <commands and observed results, or NOT RUN>
OPERATOR CHECKS: <exact commands and expected outcomes>
DECISIONS/BLOCKERS: <only material items>
NEXT: <ID> — <task name>
```

The `NEXT:` line carries the ID and the title exactly as `TASKS.md` writes it, for example `NEXT: F057 — Browser E2E`.

## 10. Accounts

Accounts are created by the operator. Credentials live only in the git-ignored `LOCAL_CREDENTIALS.md`, which the agent never reads; record a generated password when it is shown, since most are shown once.

## 11. Maintaining this file

- Update this file at the end of every completed task: §1 task IDs, §2 position and open items, §6 counts, §7 operator
  checks. Per-task history → `docs/COMPLETION_LOG.md`, recipes → `docs/VERIFICATION_LOG.md`, commits → git. **Keep it under 200 lines**; to grow it, move detail into `docs/`.
