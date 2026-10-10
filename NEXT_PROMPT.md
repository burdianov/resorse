# NEXT SESSION PROMPT — resors

> **Authoritative current-session handoff** for `D:\resors` — the single cold-start file. It replaces the earlier
> 1,852-line version (`git show ce8b703:NEXT_PROMPT.md`); archived sections live in `docs/`. `STATE.md` points here.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md, NEXT_PROMPT.md and task F058
in claude_code_pack/TASKS.md. Implement F058 only, following the one-task protocol: plan in at most
five bullets, implement, run focused checks, update NEXT_PROMPT.md, commit the task including the handoff, then stop and give
me the operator checks. Do not push. Do not start F059.
```

## 2. Current position

- **Stage A — domain-neutral foundation** (F001–F063). Stage B (D001–D091, construction domain) has not started.
- **Last completed:** F057 — Browser E2E (record: **C45**, `ARCHITECTURE.md` §5; stack in `docs/STACK_VERSIONS.md` §6).
  Playwright 1.64.0 / Chromium **1248** against a **real API and a freshly migrated real PostgreSQL** (`app_e2e` built
  from empty by `backend/scripts/e2e_database.py`), API **8001** / dev **5174** / `vite preview` of the real `dist/`
  **4174**, BP-10.4's eleven steps as one serial file with one worker. Observed: **11 passed** twice back to back
  (1.1m, 1.3m); typecheck and lint clean. **No application code changed** — a rerun exposed a race in the spec's own
  focus-trap assertion, now polled (§6).
- **Previous tasks:** F056 — Backend quality gate (**C44**; its measurements are in §7); F055 + follow-up (**C43**);
  F054 — `ab3c11a` (**C42**); F053 — `cbad877` (**C41**).
- **Next: F058 — Accessibility and visuals.** TASKS.md ~line 235: "Axe and responsive light/dark screenshot
  baselines", accept "No critical violations". `@axe-core/playwright` **4.13.0** is installed and still unused; the
  F057 suite and its isolated stack are the ground to build on (`frontend/tests/e2e/`).
- **Gates:** F016/F032/F047/F048 are complete; **G-A3 (after F048) is due and is the operator's to run**, then **G-A4**.
- **Blockers:** none recorded.
- **Open decisions (DECISIONS.md):** **O01–O18 remain OPEN** — Stage B business rules (working-day calendar, rate changes
  within a month, revision semantics, and others). None blocks F058; never treat one as approved, and if a task depends
  on one, stop and ask one precise question. Confirmed: C11–**C45** (C45 is F057's).
- **Standing habit — keep `app_dev` at head.** Migrations are exercised on `app_test`, so a table a new page reads can
  be missing from the running server while every test is green (it happened after F050). Run `alembic current` after any
  migration task; it reads `0009 (head)` today.
- **Open item — `/ready` is not built (BP-8.4b):** `conversion.health()` belongs behind it, but no readiness route
  exists — F053's `reports/engine-health` answers a different question. Read `health()`, don't re-implement it.
- **Open item — orphan objects:** an object is unlinked only *after* the caller's commit (and when it raises), so the
  residue is a process death in between. No scheduler exists; never unlink before commit.
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
| Converter | same command (F052 added it to that file) | `resors-gotenberg ... Healthy`, port `${GOTENBERG_PORT:-3100}` → 3000. Only DOCX conversion needs it; the API starts and runs without it |
| Frontend | `cd D:\resors\frontend; pnpm run dev` | `VITE ... ready` → http://localhost:5173 |
| Backend | `cd D:\resors\backend; uv run uvicorn app.main:app --reload --port 8000` | `Application startup complete` → http://localhost:8000/docs |

- The frontend calls relative `/api/v1`; Vite proxies it to port 8000 (same-origin, no CORS). `.env` sits at the
  repository root and is git-ignored.
- **Port clash:** other local projects also publish 5432 (and possibly 3100). Change `POSTGRES_PORT` /
  `GOTENBERG_PORT` in `.env` to run side by side — and change `GOTENBERG_URL` with the converter's port.
- **The browser suite needs only the database container** (it starts its own API and both frontends on 8001/5174/4174)
  and `cd D:\resors\frontend; pnpm exec playwright install chromium` once per machine.

## 5. Open items from F057

- **Needs an operator decision — the roles screen after a successful save.** `pages/admin/roles.tsx` re-seeds its draft
  from the *pre-request* cache entry when `saveMutation` succeeds, so the save bar can stay visible (and a just-saved cell
  render unchanged) **while the grant is persisted** — verified against `app_e2e`. **No backlog task owns it**: a new task must.
- **F058's inherited findings (visual/a11y):** the palette's `CommandDialog` renders its `sr-only` title and description
  outside the popup (so a *closed* dialog still contributes a heading); `BreadcrumbSeparator` renders an `<li>` inside
  the item's `<li>` (React's hydration warning); three base-ui `nativeButton` warnings (`profile.tsx`,
  `not-found.tsx:18`, `forbidden.tsx`); raw column ids in the users view-options menu.
- **Dismissed — the jsdom `Select` item (`CARRIED_CONSTRAINTS.md` §6):** an *uncontrolled* `Select` is unreachable here
  (every `<Select` under `src/` passes `value`); its trigger's rendered *label* is F058's screenshot baseline to show.

## 6. Testing and quality gates

**Focused checks** (the agent runs these and reports observed results):
- Frontend: `cd D:\resors\frontend; pnpm exec vitest run <touched test files>`, `pnpm run typecheck`,
  `pnpm run lint <paths>`, `pnpm run format:check <paths>`; backend: `cd D:\resors\backend; uv run pytest <touched
  files>`, `uv run ruff format --check <files>`, `uv run ruff check <files>`, `uv run mypy <files>`.
- **Browser specs (F057):** `cd D:\resors\frontend; pnpm exec playwright test` with the postgres container up (it
  starts its own API and servers). A failure keeps its screenshot in `frontend/test-results/` — **`error-context.md`
  snapshots only the test's first page**, so read a multi-page failure from the screenshots. Console noise from the two
  findings §5 hands to F058 (breadcrumb `<li>`, `nativeButton`) is expected and the exit code stays 0. **Poll focus
  traps**: base-ui returns focus from its guard on the next frame, so a one-shot `activeElement` read after `Tab` races it.
- **Mark a new backend test with `integration` iff it reaches the database** — `tests/test_markers.py` fails in both
  directions, so a database test without the marker and a marked test without a database fixture are both red.
- If the API contract changed: `cd D:\resors\backend; uv run python -m scripts.export_openapi`, then
  `cd D:\resors\frontend; pnpm run api:types`. Both committed artefacts must be byte-stable apart from the task's own diff.
- Dev-only surface (F054's rule): `pnpm run build`, then search `dist/` for a lab-only string or the route path — a
  match means the exclusion failed. Never infer it from the `import.meta.env.DEV` ternary.
- Lint only what you touched; whole-repo `pnpm run lint`/`format:check`/`coverage` and — from F056 — bare
  `uv run ruff check .`/`ruff format --check .`/`mypy` are **gate checks**. Never relax a threshold to pass one.

**Gate checks** (the operator runs these; the agent supplies the commands and never reports their results):
frontend → `pnpm run lint`, `format:check`, `typecheck`, `build`, `pnpm exec vitest run`, `pnpm run coverage`,
`pnpm exec playwright test`; backend → `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`,
`uv run pytest` (both legs), `uv run python -m scripts.coverage_gate`. Non-zero means a missed threshold, a red suite,
or a group below its floor.

**Gaps:** none in either gate. The frontend's `typecheck` covers `tests/` (F055 follow-up), and the backend's two
database-dependent checks **fail** rather than skip — start the container, don't run the other leg and call it a gate.

**Not yet available:** axe and the screenshot baselines (F058), production Compose (F059) — do not hand these to the
operator as runnable until their task lands. **Test counts are historical**: report the count you observe.

## 7. Operator verification commands

Run these before F058 starts. The record column is **historical and the agent's own observation**, never the operator's gate result.

| Check | Command | Record (F056 unless marked) |
|---|---|---|
| Working tree & HEAD | `git -C D:\resors status --short`; `git -C D:\resors log -1 --format="%h %s"` | clean after the commit; HEAD = `feat(F057): browser E2E`, implementation and handoff in the same commit |
| **Browser E2E (F057)** | `docker compose up -d --wait postgres`; `cd D:\resors\frontend; pnpm exec playwright install chromium`; `pnpm exec playwright test` | **F057 record**: `11 passed` on two consecutive runs (1.1m, 1.3m) — BP-10.4's eleven steps as one serial file against API 8001 / dev 5174 / preview 4174 on the run's own `app_e2e`. Needs ~3 min (it builds the frontend); the console logs the two F058 findings. The HTML report lands in `frontend/playwright-report/` |
| Backend format / lint | `cd D:\resors\backend; uv run ruff format --check .`; `uv run ruff check .` | `98 files already formatted` (applied migrations are excluded from the formatter by config — a diff in `migrations/versions/*.py` must be byte-identical, not formatted) / `All checks passed!` |
| Backend types | `cd D:\resors\backend; uv run mypy` | `Success: no issues found in 97 source files` — the file list is in `[tool.mypy]`, so the bare command covers `app`, `tests` and `scripts` |
| Backend suite | `cd D:\resors\backend; uv run pytest -m "not integration"`; `uv run pytest` | no-database leg: 168 passed, 2 skipped, 264 deselected in 1.09 s (the skips are conditional — the live Gotenberg test and this platform's symlink test). **Both legs** are a gate check, run by the agent inside the coverage gate: **432 passed, 2 skipped in 30.02 s**, needing `docker compose up -d --wait` first |
| Backend coverage gate | `cd D:\resors\backend; uv run python -m scripts.coverage_gate` | exit **0**; `core` 25 files **96.72%** (floor 85), `auth_rbac` 13 files **97.34% branches** (floor 97), `total` 65 files / 2742 stmts / 96 miss / 516 branch / 38 brpart **95.64%** (floor 95) |
| Frontend lint / format | `cd D:\resors\frontend; pnpm run lint`; `pnpm run format:check` | **F057 record**: exit 0 / `All matched files use Prettier code style!` — `.prettierignore` now excludes `playwright-report/` and `test-results/`, which the runner writes into the working tree |
| Frontend typecheck / coverage | `pnpm run typecheck`; `pnpm run coverage` | **F057 record** for typecheck (exit 0) and **F055 for coverage**: 67 files / **563** passed, All files **92.65 | 80.49 | 91.14 | 93.71**, `src/lib` **94.04 | 85.71 | 90.32 | 95.65** |
| **Dev-only exclusion** | `cd D:\resors\frontend; pnpm run build`, then search `dist/` for `Development builds only` / `recharts` / `tools/components` | **F055 record**: no match — the lab page and recharts are absent from `dist/`. A match means the exclusion broke |
| Frontend suite | `cd D:\resors\frontend; pnpm exec vitest run` | **a gate check. F055 record**: 563 passed (F047: 498) |
| OpenAPI drift | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | F057 changes no API. **F055 record**: re-run produced **no diff** |
| Dev database at head | `cd D:\resors\backend; uv run alembic current` | `0009 (head)`. Run this after any migration task — a dev database behind head serves 500s while every test is green |
| Migration round trip | `upgrade head` → `downgrade base` → `upgrade head` against **`app_test`** only (§3) | **not run by the agent** (F057 adds no migration). F049 record: clean, ending at `0009` |

**The end-to-end checks by hand** (F054's lab, F053's export, F050's downloads) are the last two rows of `docs/VERIFICATION_LOG.md`'s "Check the work" table.

## 8. Reference documents (read only the section a task needs)

| Document | Use |
|---|---|
| `claude_code_pack/CLAUDE_MASTER.md` | Protocol, stop conditions, operating lessons |
| `claude_code_pack/TASKS.md` | Backlog; F058 is at about line 235 |
| `claude_code_pack/DECISIONS.md` | Confirmed decisions C11–C45; open decisions O01–O18 |
| `claude_code_pack/PRODUCT_SPEC.md` | Functional contract; read only the needed sections |
| `claude_code_pack/OPERATOR_GUIDE.md` | Operator runbook and gate list (incl. the browser suite's prerequisites) |
| `docs/ARCHITECTURE.md` | §3 sessions, §4 backend (incl. the F056 quality gate), §5 frontend (incl. F055's and the F057 browser suite), §6 authorization, §7 boundaries, §12 traps |
| `docs/REQUIREMENT_TRACEABILITY.md` | BP-x.y index (§1–§11) and §14 gaps |
| `docs/ROUTES_NAVIGATION.md`, `docs/OPENAPI_CLIENT.md` | Routing registry; typed-client recipe |
| `docs/STACK_VERSIONS.md` | Version pins, the toolchain (§3), the browser stack (§6), approved deviations (§5). `docs/CARRIED_CONSTRAINTS.md` / `docs/ENVIRONMENT.md`: archived §6 constraints / §4 environment snapshot |

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

The `NEXT:` line carries the ID and the title exactly as `TASKS.md` writes it, for example `NEXT: F058 — Accessibility and visuals`.

## 10. Accounts

Accounts are created by the operator. Credentials live only in the git-ignored `LOCAL_CREDENTIALS.md`, which the agent never reads; record a generated password when it is shown, since most are shown once.

## 11. Maintaining this file

- Update this file at the end of every completed task: §1 task IDs, §2 position and open items, §6 counts, §7 operator
  checks. Per-task history → its `DECISIONS.md` record and `docs/ARCHITECTURE.md` (`docs/COMPLETION_LOG.md` is a frozen archive), recipes → `docs/VERIFICATION_LOG.md`, commits → git. **Keep it under 200 lines**; to grow it, move detail into `docs/`.
