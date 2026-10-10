# NEXT SESSION PROMPT — resors

> **Authoritative current-session handoff** for `D:\resors` — the single cold-start file. It replaces the earlier
> 1,852-line version (`git show ce8b703:NEXT_PROMPT.md`); archived sections live in `docs/`. `STATE.md` points here.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md, NEXT_PROMPT.md and task F056
in claude_code_pack/TASKS.md. Implement F056 only, following the one-task protocol: plan in at most
five bullets, implement, run focused checks, update NEXT_PROMPT.md, commit the task including the handoff, then stop and give
me the operator checks. Do not push. Do not start F057.
```

## 2. Current position

- **Stage A — domain-neutral foundation** (F001–F063). Stage B (D001–D091, construction domain) has not started.
- **Last completed:** F055 — Frontend quality gate, **plus its follow-up** (both in this commit; full record: **C43** and
  `ARCHITECTURE.md` §5). The gate is four commands, one job each (`pnpm run lint` — ESLint 10, deliberately **not
  type-aware**; `format:check` — Prettier, after a **one-time 108-file** pass; `typecheck`; `coverage`), with BP §10.5's
  **85** for `src/lib/**` plus a global ratchet at the measurement — All files **92.65 / 80.49 / 91.14 / 93.71**,
  `src/lib` **94.04 / 85.71 / 90.32 / 95.65**.
- **The follow-up** (operator: "clear all the blockers before continuing with f056"): `tsconfig.json` now includes
  `tests/`, so `typecheck` covers the test tree and found **20 real errors** lint and coverage had both walked past
  (inventory in C43); one test was **deleted rather than fixed** (`scroll-area.test.tsx` asserted an `orientation` the root
  does not carry — jsdom does no layout, so F057's browser pass is the real check); and **`test.testTimeout` is 15 s**,
  because under the 5 s default three unrelated tests died at 5089 / 5098 / 5146 ms that pass in ~1.5 s standalone — the
  lab's 10 s finder timeout could never fire under a 5 s budget, so F055's flake repair was incomplete. Suite: 67 files /
  **563** tests (one deleted, none added).
- **Previous tasks:** F054 — Frontend component lab **`ab3c11a`** (C42); F053 — `cbad877` (C41).
- **Next: F056 — Backend quality gate.** TASKS.md ~line 227: "Ruff typing pytest Postgres integration coverage"; the
  accept line is "Recorded actual results." Ruff and mypy already run (F053 used them as focused checks); this task
  makes them a gate and adds the real-Postgres integration leg and backend coverage.
- **Gates:** F016, F032, F047 and F048 are complete; operator gate results are **not recorded in this handoff**.
  **G-A3 (after F048) is due and is the operator's to run** (`OPERATOR_GUIDE.md` line 54); then **G-A4, after F063**.
- **Blockers:** none recorded.
- **Open decisions (DECISIONS.md):** **O01–O18 remain OPEN** — Stage B business rules (working-day calendar, rate changes
  within a month, revision semantics, and others). None blocks F056; never treat one as approved, and if a task depends
  on one, stop and ask one precise question. Confirmed: C11–C43 (C43 is F055's).
- **Fixed during F055 — the dev database was behind head.** `app_dev` sat at Alembic `0008` while `0009` (which creates
  `file_assets`) had shipped, so the first page to call `GET /api/v1/files` — F054's lab — answered **500**, with every
  test green: migrations are exercised on `app_test`. `alembic upgrade head` was applied; `alembic current` reads `0009 (head)`.
- **Open item — `/ready` is not built (BP-8.4b):** `conversion.health()` belongs behind it, but no readiness route
  exists — F053's `reports/engine-health` answers a different question. Read `health()`, don't re-implement it.
- **Open item — orphan objects:** the object is unlinked only *after* the caller's commit (and when it raises), so the
  residue is a process death in between — an unreferenced object, never a dangling row. No scheduler exists, so no
  sweep is built; never unlink before commit.
- **Open item — nothing scans uploads yet:** BP-6.4's hook ships as `MalwareScanner` + `NoMalwareScanner` (the name is
  the disclosure). Nothing is wired in; the API answers 400 if one ever refuses — never call uploads scanned.

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

**jsdom `Select` rendering.** An uncontrolled `Select` shows the raw value (`site`) instead of the label (`Site`) and
leaves the listbox mounted — possibly a layout-less artefact, so tests neither assert nor forbid it. **Confirm in a browser at F057.**

## 6. Testing and quality gates

**Focused checks** (the agent runs these and reports observed results):
- Frontend: `cd D:\resors\frontend; pnpm exec vitest run <touched test files>`, `pnpm run typecheck`,
  `pnpm run lint <paths>`, `pnpm run format:check <paths>`; backend: `cd D:\resors\backend; uv run pytest <touched
  files>`, `uv run ruff format --check <files>`, `uv run ruff check <files>`, `uv run mypy <files>`.
- If the API contract changed: `cd D:\resors\backend; uv run python -m scripts.export_openapi`, then
  `cd D:\resors\frontend; pnpm run api:types`. Both committed artefacts must be byte-stable apart from the task's own diff.
- If the change touches a **dev-only surface** (F054's rule): `cd D:\resors\frontend; pnpm run build`, then search
  `dist/` for a lab-only string ("Development builds only", `recharts`) and for the route path — any match means the
  exclusion failed. Do not infer the exclusion from the `import.meta.env.DEV` ternary.
- Lint only what you touched: whole-repo `pnpm run lint`, `pnpm run format:check` and `pnpm run coverage` are **gate
  checks** (coverage's thresholds make it one by construction). Never relax a threshold to pass a check.

**Gate checks** (the operator runs these; the agent supplies the commands and never reports their results):
`cd D:\resors\frontend;` → `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run build`,
`pnpm exec vitest run`, `pnpm run coverage` (exit non-zero means a threshold was missed); `cd D:\resors\backend; uv run pytest`.

**Gaps:** none outstanding in the frontend gate. `typecheck` now covers `tests/` (F055 follow-up), and the parallel-load
flake has a suite-level budget of 15 s (`test.testTimeout`) — a check that passes alone but fails in the full run, or the
reverse, is worth flagging rather than handing over silently.

**Ruff and mypy are runnable** from `backend/` (`uv run ruff format --check <files>` / `uv run ruff check <files>` /
`uv run mypy <files>`), and F053 ran them as focused checks — **not** operator gate checks until F056 lands (`OPERATOR_GUIDE.md` 38–39).

**Not yet available:** Playwright E2E (F057), axe (F058), production Compose (F059) — do not hand these to the operator
as runnable until their task lands. **Test counts are historical**: report the count you observe.

## 7. Operator verification commands

Run these before F056 starts. The record column is **historical and the agent's own observation**, never the operator's gate result.

| Check | Command | F055 + follow-up record (historical) |
|---|---|---|
| Working tree & HEAD | `git -C D:\resors status --short`; `git -C D:\resors log -1 --format="%h %s"` | clean after the commit; HEAD = `feat(F055): frontend quality gate` **plus the follow-up** (`fix(F055): ...`), implementation and handoff in the same commit |
| Frontend lint | `cd D:\resors\frontend; pnpm run lint` | exit 0, no problems (observed at F055, re-observed in the follow-up after the config changes; a gate check, so the operator owns the current result) |
| Frontend format | `cd D:\resors\frontend; pnpm run format:check` | `All matched files use Prettier code style!` (observed at F055 after the one-time 108-file reformat; clean again in the follow-up) |
| Frontend coverage | `cd D:\resors\frontend; pnpm run coverage` | exit **0**; 67 files / **563** passed; All files **92.65 | 80.49 | 91.14 | 93.71**, `src/lib` **94.04 | 85.71 | 90.32 | 95.65** (run again in the follow-up: same numbers, one fewer test) |
| Frontend typecheck | `cd D:\resors\frontend; pnpm run typecheck` | exit 0, no diagnostics over **`src` and `tests`** (the follow-up widened `include` and cleared the 20 errors it exposed; `pnpm run build` runs that same `tsc --noEmit`, and `pnpm run build` exited 0 afterwards) |
| **Dev-only exclusion** | `cd D:\resors\frontend; pnpm run build`, then search `dist/` for `Development builds only` / `recharts` / `tools/components` | **no match** (re-observed at F055 after the toolchain install): the lab page and recharts are absent from `dist/`. A match means the exclusion broke |
| OpenAPI drift | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | F055 changes no API. Re-run after installing the toolchain produced **no diff** (observed at F055) |
| Frontend suite | `cd D:\resors\frontend; pnpm exec vitest run` | **a gate check: the operator owns the result.** The agent ran it repeatedly: the pre-follow-up state passed 564/564 in 15.0 s, and with the follow-up **563** passed in four runs (20.3 / 22.9 / 24.8 s, plus the coverage run) and one run saw **560 / 563**, when a `git stash` rewriting 16 files had three tests die at 5089 / 5098 / 5146 ms against the old 5 s default — that run is what produced the 15 s budget. F047 record: 498 passed (historical) |
| Dev database at head | `cd D:\resors\backend; uv run alembic current` | `0009 (head)` — it read `0008` before F055's fix, which is why `GET /api/v1/files` answered 500. Run this after any migration task |
| Migration round trip | `upgrade head` → `downgrade base` → `upgrade head` against **`app_test`** only (§3) | **not run by the agent** (F055 adds no migration). F049 record: clean, ending at `0009` |
| Backend suite | `cd D:\resors\backend; uv run pytest` | **a gate check; not run by the agent at F055.** F047 record: 246 passed (historical) |

**The end-to-end check (F054's, unblocked by F055's `alembic upgrade head`).** In a **dev** build (`pnpm run dev`), signed
in as an `admin`: the sidebar should show a **Tools** group holding **Component Lab**, and `/tools/components` should
render the primitives, the charts and the files section — which should work end to end (upload a real file, preview the
text one, download it under the server's own name, delete it through the confirm dialog), because the `file_assets` table
the 500 complained about exists. In a **production** build the same path must 404 — the build row above checks that without
a browser. By hand at `localhost:8000/docs`: F053's export (`/admin/users` → **Export PDF** →
`user-directory-<date>.pdf`, the 1,000-row sentence) and F050's downloads (`nosniff`, `private, no-store`; a foreign file id → **404**).

## 8. Reference documents (read only the section a task needs)

| Document | Use |
|---|---|
| `claude_code_pack/CLAUDE_MASTER.md` | Protocol, stop conditions, operating lessons |
| `claude_code_pack/TASKS.md` | Backlog; F056 is at about line 227 |
| `claude_code_pack/DECISIONS.md` | Confirmed decisions C11–C43; open decisions O01–O18 |
| `claude_code_pack/PRODUCT_SPEC.md` | Functional contract; read only the needed sections |
| `claude_code_pack/OPERATOR_GUIDE.md` | Operator runbook and gate list |
| `docs/ARCHITECTURE.md` | §3 sessions, §5 frontend (incl. the F055 quality gate), §6 authorization, §7 boundaries, §12 traps |
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

The `NEXT:` line carries the ID and the title exactly as `TASKS.md` writes it, for example `NEXT: F056 — Backend quality gate`.

## 10. Accounts

Accounts are created by the operator. Credentials live only in the git-ignored `LOCAL_CREDENTIALS.md`, which the agent never reads; record a generated password when it is shown, since most are shown once.

## 11. Maintaining this file

- Update this file at the end of every completed task: §1 task IDs, §2 position and open items, §6 counts, §7 operator
  checks. Per-task history → `docs/COMPLETION_LOG.md`, recipes → `docs/VERIFICATION_LOG.md`, commits → git. **Keep it under 200 lines**; to grow it, move detail into `docs/`.
