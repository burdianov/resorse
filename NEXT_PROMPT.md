# NEXT SESSION PROMPT — resors

> **Authoritative current-session handoff** for `D:\resors` — the single cold-start file. It replaces the earlier
> 1,852-line version (`git show ce8b703:NEXT_PROMPT.md`); archived sections live in `docs/`. `STATE.md` points here.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md, NEXT_PROMPT.md and the task I name
in claude_code_pack/TASKS.md. Stage A is complete (F001–F063, plus the two repairs F064 and F065, both
landed); Stage B has started — D001–D006 landed (C52, C61, C62, C63, C64, C65). **Every decision is CONFIRMED — C11–C65, and
none is open.** **G-A3 (due since F048) and G-A4 are still not recorded** in docs/IMPLEMENTATION_LOG.md.
Implement only the task I name — plan in at most five bullets, implement, run focused checks, update
NEXT_PROMPT.md, commit the task including the handoff, then stop and give me the operator checks. Do not push.
```

## 2. Current position

- **Stage A — domain-neutral foundation — is complete** (F001–F063), with **two repairs added 2026-10-10**: **F064** (the
  roles-screen save-state defect) and **F065** (the `/ready` probe), both **landed** — findings the foundation recorded as
  open and unowned (C59). **Stage B has started: D001–D006 landed (C52, C61, C62, C63, C64, C65)** — the map, the domain's
  first three tables, their API and their screens, revisions `0010`–`0013`. The application runs D001–D091; its gate checkpoints (D018, D036, D063, D078, D091) are the operator's.
- **Last completed:** **D006 — Master data UI** (**C65**; frontend-only, **head still `0013`**): the three reference-table
  screens over D005's API — `/masters/{disciplines,departments,designations}` under a **"Reference Data"** nav group, in
  `APP_MODULES`' first real module. Client-mode tables, one dialog per screen, code shown-not-submitted, delete left to the
  server. **A page-drawing task still owes the operator a visual-baseline re-pin** (the shell gained a nav group).
- **Previous:** **D005 — Master CRUD backend** (**C64**; 15 routes under `/api/v1/masters/…`, six codes, `0013`); **D004 — Designations migration** (**C63**; `designations`, `0012`, two references); **D003 — Departments migration** (**C62**, `departments`, `0011`); **D002** (**C61**); **F065** (**C60**); **F064** (C59).
- **Next:** **D007 — Projects migration** (TASKS.md line 297) — `projects`, with project code, status, start/contract/forecast
  dates; the `projects` module's first table. **G-A3 can be run** (C59).
- **Gates:** the runbook is `OPERATOR_GUIDE.md` §Gates; evidence goes in **`docs/IMPLEMENTATION_LOG.md`** (G-A1/G-A2 have no
  dated run recorded). **G-A3 (due since F048) and G-A4 are still not recorded** — commands in `docs/FOUNDATION_REPORT.md` §5; D001–D006, F064 and F065 touched no gate evidence. **G-9 (`/ready`) is closed by F065.**
- **Open decisions (DECISIONS.md):** **none.** Every decision is CONFIRMED — `C11`–**`C65`** — and `docs/DOMAIN_ARCHITECTURE.md`
  §4 records where each answer landed and which task owns it. The register's rule applies in reverse too: **a confirmed rule is amended by a new entry that says so, never edited in place.**
- **Standing habit — keep `app_dev` at head.** Migrations are exercised on `app_test`, so a table a new page reads can be missing from the running server while every test is green (it happened after F050). Run `alembic current` after any migration task; it read `0009` until D003's run and **`0013 (head)`** now — D003's migration script mis-targeted `app_dev` once (the settings/engine caches are `lru_cache`d: set `DATABASE_URL` **then** clear them, in that order, as `tests/conftest.py` does), so `app_dev` is at `0011` (D004 and D005 ran their round trips on `app_test` only) but **has never been seeded** — the seed reads `disciplines`, so `alembic upgrade head` must come before `python -m app.seed` (both are §7 checks).
- **Open item — orphan objects:** unlinked only *after* the caller's commit (and when it raises), so the residue is a process death in between; never unlink before commit.
- **Open item — nothing scans uploads yet:** BP-6.4's hook ships as `MalwareScanner` + `NoMalwareScanner`, nothing is wired in, and a refusal is a 400 — never call uploads scanned.

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

- The frontend calls relative `/api/v1` (Vite proxies it to 8000; same-origin, no CORS); `.env` sits at the repository root and is git-ignored.
- **Port clash:** other local projects also publish 5432 (and 3100) — change `POSTGRES_PORT` / `GOTENBERG_PORT` in `.env` (and `GOTENBERG_URL`) to run side by side.
- **The browser suite needs only the database container** (its own API and frontends on 8001/5174/4174) + `pnpm exec playwright install chromium` once per machine.

## 5. Open items

- **The visual baselines are platform-tagged** (`…-quality-win32.png`): on Linux, `pnpm run test:visual` finds none of
  them and fails every state as new — F061 (CI) runs them in a Windows job. Not a defect if you meet it (`ARCHITECTURE.md` §12).
- **Dismissed — the jsdom `Select` item, both halves now closed** (`CARRIED_CONSTRAINTS.md` §6): an uncontrolled `Select` is
  unreachable here (every `<Select` under `src/` passes `value`), and its other half — the raw value rendering on the trigger
  instead of the label — D006 fixed at the source: `SelectField` now passes `items={options}`, so base-ui can resolve a preset
  selection's label. No existing rendered label changed (`settings.tsx`'s only preset option has `label === value`).

## 6. Testing and quality gates

**Focused checks** (the agent runs these and reports observed results):
- Frontend (from `frontend/`): `pnpm exec vitest run <touched test files>`, `pnpm run typecheck`, `pnpm run lint <paths>`,
  `pnpm run format:check <paths>`; backend (from `backend/`): `uv run pytest <files>`, `uv run ruff format --check <files>`, `uv run ruff check <files>`, `uv run mypy <files>`.
- **Browser specs (F057) and the two quality suites (F058):** `cd D:\resors\frontend; pnpm exec playwright test` runs
  them all; `pnpm run test:a11y` / `test:visual` are the same project filtered to one file, and both make `workflow.spec.ts`
  run first. The postgres container must be up (each invocation builds its own `app_e2e`). A failure keeps its screenshot in
  `frontend/test-results/` — **`error-context.md` snapshots only the test's first page**. **A visual difference is looked at,
  never re-pinned blind** (`test:visual:update` writes; `test:visual` is the run that says they are stable), and **poll both races** — a one-shot `activeElement` read after `Tab` races base-ui's focus guard, and `useTheme` polls `html.dark`.
- **Mark a new backend test with `integration` iff it reaches the database** — `tests/test_markers.py` fails in both
  directions, so a database test without the marker and a marked test without a database fixture are both red.
- If the API contract changed: `cd D:\resors\backend; uv run python -m scripts.export_openapi`, then
  `cd D:\resors\frontend; pnpm run api:types`. Both committed artefacts must be byte-stable apart from the task's own diff.
- Dev-only surface (F054's rule): `pnpm run build`, then search `dist/` for a lab-only string or the route path — a
  match means the exclusion failed. Never infer it from the `import.meta.env.DEV` ternary.
- Lint only what you touched; whole-repo `pnpm run lint`/`format:check`/`coverage` and — from F056 — bare `uv run ruff check .`/`ruff format --check .`/`mypy` are **gate checks**. Never relax a threshold to pass one.

**Gate checks** (the operator runs these; the agent supplies the commands and never reports their results):
frontend → `pnpm run lint`, `format:check`, `typecheck`, `build`, `pnpm exec vitest run`, `pnpm run coverage`,
`pnpm exec playwright test`; backend → `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`,
`uv run pytest` (both legs), `uv run python -m scripts.coverage_gate`. Non-zero means a missed threshold, a red suite, or a group below its floor.

**Gaps:** none in either gate. The frontend's `typecheck` covers `tests/` (F055 follow-up), and the backend's two database-dependent checks **fail** rather than skip — start the container, don't run the other leg and call it a gate.

## 7. Operator verification commands

The record column is **historical and the agent's own observation**, never the operator's gate result.

| Check | Command | Record (F056 unless marked) |
|---|---|---|
| Working tree & HEAD | `git -C D:\resors status --short`; `git -C D:\resors log -1 --format="%h %s"` | clean after the commit; **F063 record**: HEAD = `feat(F063): foundation handoff` (the implementation and the updated handoff in one commit). F062 recorded `docs(F062): operations docs` the same way |
| **Browser E2E (F057)** | `docker compose up -d --wait postgres`; `cd D:\resors\frontend; pnpm exec playwright install chromium`; `pnpm exec playwright test` | **F057 record**: `11 passed` on two consecutive runs (1.1m, 1.3m) — BP-10.4's eleven steps as one serial file against API 8001 / dev 5174 / preview 4174 on the run's own `app_e2e`. Needs ~3 min (it builds the frontend). `pnpm exec playwright test` now also runs F058's two files; the console noise it used to log (breadcrumb `<li>`, `nativeButton`) had its causes removed in F058 and **no spec asserts the console**. The HTML report lands in `frontend/playwright-report/` |
| **Visual baselines (F058)** | `docker compose up -d --wait postgres`; `cd D:\resors\frontend; pnpm run test:visual` | **F058 record**: `105 passed` — the 11 workflow steps plus **94 screenshots** — and what certifies them is `pnpm run test:visual:update` (wrote them; `105 passed (3.5m)`) followed by a plain `pnpm run test:visual` that reproduced all 94 and **wrote nothing** (`105 passed (3.3m)`; the newest baseline's mtime predates it). Getting there took a second pass: a re-run of the committed baselines failed **10 of 105**, because a worker restarts after any failure and re-runs the suite's setup — the run photographed its own history (a stored sidebar preference, one more inbox notice per restart, and the masked `<time>`'s box moving with the phrase's width). All three are fixed in the suite (`State.sidebar`, the inbox trimmed to the one notice the run just caused, a 7rem minimum width on `<time>`), and the ten diffs were read before their baselines were re-pinned — exactly ten files changed, 94 in and 94 out. A difference fails the run and writes actual/expected/diff into `frontend/test-results/`; `maxDiffPixels: 0`. Snapshots are committed (`frontend/tests/e2e/visual.spec.ts-snapshots/`, `*-quality-win32.png`) |
| **Accessibility (F058)** | `docker compose up -d --wait postgres`; `cd D:\resors\frontend; pnpm run test:a11y` | **F058 record**: `25 passed (1.5m)` — the 11 workflow steps plus **14 axe scans over 9 screens** (five of them in both themes, plus 403 / 404 / unreachable-server / mobile drawer). WCAG 2.2 A/AA, failing on `critical` **and** `serious`, no rule suppressed. The theme check is **polled**: reading `html.dark` once after `emulateMedia` lost the race on the sign-in screen — 1 scan of 14 — and the fix was the assertion, not the app |
| Backend format / lint | `cd D:\resors\backend; uv run ruff format --check .`; `uv run ruff check .` | `98 files already formatted` (applied migrations are excluded from the formatter by config — a diff in `migrations/versions/*.py` must be byte-identical, not formatted) / `All checks passed!` |
| Backend types | `cd D:\resors\backend; uv run mypy` | `Success: no issues found in 97 source files` — the file list is in `[tool.mypy]`, so the bare command covers `app`, `tests` and `scripts` |
| Backend suite | `cd D:\resors\backend; uv run pytest -m "not integration"`; `uv run pytest` | no-database leg: 168 passed, 2 skipped, 264 deselected in 1.09 s (the skips are conditional — the live Gotenberg test and this platform's symlink test). **Both legs** are a gate check, run by the agent inside the coverage gate: **432 passed, 2 skipped in 30.02 s**, needing `docker compose up -d --wait` first |
| Backend coverage gate | `cd D:\resors\backend; uv run python -m scripts.coverage_gate` | exit **0**; `core` 25 files **96.72%** (floor 85), `auth_rbac` 13 files **97.34% branches** (floor 97), `total` 65 files / 2742 stmts / 96 miss / 516 branch / 38 brpart **95.64%** (floor 95) |
| Frontend lint / format | `cd D:\resors\frontend; pnpm run lint`; `pnpm run format:check` | **F063 record**: exit 0 / `All matched files use Prettier code style!` — but the lint gate had been **red since F060** (`public/theme-init.js`, 5 errors) and CI would have failed on its first run; fixed in F063 (C51). `.prettierignore` excludes `playwright-report/` and `test-results/`, which the runner writes into the working tree |
| Frontend typecheck / coverage | `pnpm run typecheck`; `pnpm run coverage` | **F057 record** for typecheck (exit 0) and **F055 for coverage**: 67 files / **563** passed, All files **92.65 | 80.49 | 91.14 | 93.71**, `src/lib` **94.04 | 85.71 | 90.32 | 95.65** |
| **Dev-only exclusion** | `cd D:\resors\frontend; pnpm run build`, then search `dist/` for `Development builds only` / `recharts` / `tools/components` | **F055 record**: no match — the lab page and recharts are absent from `dist/`. A match means the exclusion broke |
| Frontend suite | `cd D:\resors\frontend; pnpm exec vitest run` | **a gate check. F055 record**: 563 passed (F047: 498) |
| OpenAPI drift | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | **F065 record**: both regenerated for the new route and the moved `engine-health` description — `29 paths / 44 operations`, `/api/v1/ready` with its 503, and the typed client byte-identical on a re-run. **F055 record** for the no-diff check |
| **CI (F061)** | Push the branch and read the Actions run for `CI`. Locally, the workflow lint: `docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -no-color .github/workflows/ci.yml` | Agent record: actionlint clean (no output). Expect all seven jobs green; the `visual` job is the one to read first, because its PostgreSQL step is unverified (DECISIONS C49) |
| **Operations docs (F062)** | Read the `README.md` quick start and walk it on a clean machine; then `docs/DEPLOYMENT.md` §3–§6 and `docs/BACKUP_RESTORE.md` | Documentation, so there is no gate command. The check: the quick start agrees with `OPERATOR_GUIDE.md`, the commands run as written, and every recorded gap still says so — `DEPLOYMENT.md` §14 (no real VPS, ACME/HTTPS/load untested), `BACKUP_RESTORE.md` §9 (**no backup has ever been taken**), `TESTING.md` §7 (no CI job observed running). Anything that reads as verified and is not, is a defect |
| **Security (F060)** | `cd D:\resors\backend; uv run pytest tests/test_production_hardening.py` | 23 passed (agent record). Edge check on a live host: `curl -sI https://<SITE_ADDRESS>/` shows the CSP, HSTS and `nosniff` (`docs/SECURITY.md` §4.2) |
| **Foundation report (F063)** | Read `docs/FOUNDATION_REPORT.md` (BP-14.8), then `cd D:\resors\backend; uv run pytest tests/test_extension_contract.py tests/test_foundation_boundaries.py` and `cd D:\resors\frontend; pnpm exec vitest run tests/config/modules.test.tsx` | The report is the check: it must not claim a gate result, and every number in it must be attributable. Agent record: 9 / 5 / 7 passed. **G-A3 and G-A4 run against this tree** — the commands are in the report's §5 |
| **Domain map (D001)** | Read `docs/DOMAIN_ARCHITECTURE.md`; then `cd D:\resors\backend; uv run alembic heads` and `cd D:\resors\frontend; grep -n "APP_MODULES" src/config/modules.ts` | The check is that the document claims no code: `alembic heads` read `0009` when D001 landed and reads **`0013` since D005** (the map carried no revision), `APP_MODULES` is `[]`, `PermissionCode` had no domain member until D005. **Every decision it once deferred to is CONFIRMED now (`C53`–`C59`), so the map must carry no `[Ox]` marker and no unwritable constraint** — its §4 records where each answer landed. A table, route or code that landed in D001 is a defect; so is a rule the map states as decided that `DECISIONS.md` does not |
| **Disciplines table and seed (D002)** | `cd D:\resors\backend; uv run pytest tests/test_disciplines.py tests/test_seed.py` (both legs, container up); then `uv run alembic current` and `uv run alembic upgrade head` + `uv run python -m app.seed` on **`app_dev`** | **D002 record**: `10 + 8 passed` on the database leg and `5 passed` on the no-database leg; the round trip `upgrade head` → `downgrade 0009` → `upgrade head` clean against `app_test`; `alembic check` reports **no model-to-schema drift**. The operator's part: `alembic current` reads **`0010 (head)`**; the first `python -m app.seed` prints `disciplines created: 7` and the **second** prints `Seed: nothing to do — roles, permissions and reference rows are up to date.` A second run that creates a row, or renames a row an operator edited, is a defect |
| **Readiness probe (F065)** | `cd D:\resors\backend; uv run pytest tests/test_readiness.py`; then, with the stack up, call it **inside** the container: `docker compose -f docker-compose.prod.yml exec backend python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/ready').read().decode())"` | **F065 record**: `11 passed` (unit leg 8, database leg 3). The check is the separation: `/api/v1/ready` answers `ready` when all three dependencies do, `degraded` with a 200 when an optional half is down, and `not_ready` with a **503** when PostgreSQL is — while `/api/v1/health` stays 200 and liveness. **Through the edge it must be a 404** (`deploy/Caddyfile` refuses the path; verified against `caddy:2.11.7-alpine` in F065), so a `curl -s https://<SITE_ADDRESS>/api/v1/ready` showing a JSON verdict is a defect, not a convenience |
| **Roles matrix save (F064)** | `cd D:\resors\frontend; pnpm exec vitest run tests/admin/roles.test.tsx`; in the browser suite, `pnpm exec playwright test -g "creates two roles"` | **F064 record**: `14 passed`. The check is the screen's own contract — the save clears its unsaved state **without waiting for its re-read**, so no phantom "unsaved change" and no just-saved cell drawn from the old answer. The unit test holds the re-read open to prove it; the browser helper asserts the bar going (F057 had to drop that assertion) |
| **Production stack (F059)** | Create `.env.production` from `.env.production.example` (real values, git-ignored), then `cd D:\resors; docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait` | Agent's record (scratch env, `SITE_ADDRESS=localhost`): all five services healthy, `migrate` exit 0. The operator's check: `curl -k https://<SITE_ADDRESS>/api/v1/health` → `"environment":"production"`; `docker compose -f docker-compose.prod.yml --env-file .env.production down` leaves volumes intact (`down -v` deletes them) |
| Migration state — dev at head, and the round trip | `cd D:\resors\backend; uv run alembic current`; then `upgrade head` → `downgrade <previous>` → `upgrade head` against **`app_test`** only (§3) | `0013 (head)` from the tree; **`app_dev` reads `0011`** (D004 and D005 ran their round trips on `app_test`). **D005 record**: the round trip `0013` → `0012` → `0013` clean on `app_test`, `alembic check` reporting **no model-to-schema drift** (D005 adds no table — `downgrade` restores 0009's two CHECKs verbatim). **D004 record**: the round trip `0012` → `0011` → `0012` clean on `app_test`, `alembic check` reporting **no model-to-schema drift**. **D003 record**: the round trip `0011` → `0010` → `0011` clean on `app_test` (verified by reading `alembic_version` back in **both** databases), `alembic check` reporting **no model-to-schema drift**, and **`app_dev` reading `0011 (head)`** — D003's first migration script mis-targeted it from `0009` (a `DATABASE_URL` override set *after* the first `get_settings()` is ignored: both that and `get_engine` are `lru_cache`d, so the variable goes first and the caches are cleared after, which is what `tests/conftest.py` does). **No data was lost** — both domain tables were empty and nothing was seeded there — but the operator's `python -m app.seed` on `app_dev` has still never run. Never `downgrade base` against `app_dev` |
| **Departments table (D003)** | `cd D:\resors\backend; uv run pytest tests/test_departments.py tests/test_foundation_boundaries.py` (both legs, container up); then `uv run alembic current` and `uv run alembic upgrade head` on **`app_dev`** | **D003 record**: `24 passed` over both legs (`9 passed, 15 deselected` on the database-free leg); `alembic check` reports **no model-to-schema drift**. The check is the classification: a third value, lowercase `head_office`, and a **missing** classification are each refused, and both shipped values are accepted. **No rows ship** — after `alembic upgrade head` the table is empty and `python -m app.seed` does not fill it; a department appearing there is a defect. The boundary scan is the other half: `department` no longer trips it, and the retained reference-product terms still do |
| **Designations table (D004)** | `cd D:\resors\backend; uv run pytest tests/test_designations.py tests/test_foundation_boundaries.py` (both legs, container up); then `uv run alembic current` on **`app_dev`** | **D004 record**: `26 passed` over both legs (`9 passed, 16 deselected` on the database-free leg); `alembic check` reports **no model-to-schema drift**. The acceptance is the references and the uniqueness: a duplicate `code` is refused by `ix_designations_code`; a `department_id`/`discipline_id` naming no row is refused by name (`fk_designations_…`); a **NULL** reference is refused; a **department or discipline a designation still names cannot be deleted** — while two designations may **share** a department and a discipline (the code is the identity, not the pair). **No rows ship** — after `alembic upgrade head` the table is empty and `python -m app.seed` does not fill it |
| **Reference-table screens (D006)** | `cd D:\resors\frontend; pnpm exec vitest run tests/masters tests/config/modules.test.tsx`; then, with the stack up and `app_dev` at head and seeded, open `/masters/disciplines` as a `viewer` and as a `.manage` holder | **D006 record**: `34 passed` over the three screens plus the registry (`465` + `39` on the wider focused set the `SelectField` change could reach); typecheck, lint and prettier clean; a boundary scan of `frontend/src` + `frontend/public` reported `0` offenders. The check is the module and the writes: the **Reference Data** group appears in the sidebar for exactly a holder of one of the three read codes, `/masters/designations` **refuses a caller with only the two reference reads**, a create posts `{code,name}` (departments add `classification`, designations their two ids), an edit's body carries **no `code`** and its code input is **disabled**, deactivate is one PATCH of `is_active`, and a referenced row's delete answers the server's own **409** sentence. **The operator's part**: `pnpm run test:visual:update` then `pnpm run test:visual` — the F058 baselines photograph the shell, and D006 added a nav group, so look at the diffs before re-pinning |
| **Master CRUD backend (D005)** | `cd D:\resors\backend; uv run pytest tests/test_masters_api.py` (both legs, container up); then `uv run alembic current` on **`app_dev`** and `uv run python -m app.seed` | **D005 record**: `42 passed` over both legs (`4 passed, 38 deselected` on the database-free leg); `157 passed` on the wider focused set. The check is the guards and the reference rule: each of the 15 routes answers **401** with no session; `disciplines.read` opens only disciplines and `manage` does not imply `read`; a duplicate `code` is a **409**; an unknown `department_id`/`discipline_id` is a **422 naming the field**; an edit submitting `code` is a **422** (`extra="forbid"`); `{}` or all-nulls is a **400**; and a department or discipline a designation still names answers the delete with a **409 "Deactivate it instead."** The operator's part: `alembic current` reads **`0013 (head)`**, and `python -m app.seed` grants `admin`/`viewer` the six new codes — an already-seeded database gains them only on that run |

**The end-to-end checks by hand** (F054's lab, F053's export, F050's downloads) are the last two rows of `docs/VERIFICATION_LOG.md`'s "Check the work" table.

## 8. Reference documents (read only the section a task needs)

| Document | Use |
|---|---|
| `claude_code_pack/CLAUDE_MASTER.md` | Protocol, stop conditions, operating lessons |
| `claude_code_pack/TASKS.md` | Backlog; **both Stage A repairs have landed (F064, F065) — Stage A is closed for good; D001–D006 have landed and D007 is next (line 297). D050–D053 are withdrawn (C53), D041 is re-scoped, and D083a is new** |
| `claude_code_pack/DECISIONS.md` | Confirmed decisions **C11–C65** — **no OPEN row remains**; §"no OPEN rows" records that an amendment is a new entry, never an edit in place |
| `claude_code_pack/PRODUCT_SPEC.md` | Functional contract; read only the needed sections |
| `claude_code_pack/OPERATOR_GUIDE.md` | Operator runbook, the **§Gates runbook** and the gate list (incl. the browser suite's prerequisites); evidence → `docs/IMPLEMENTATION_LOG.md` |
| `docs/ARCHITECTURE.md` | §3 sessions, §4 backend (incl. the F056 quality gate), §5 frontend (incl. F055's and the F057/F058 browser suites), §6 authorization, §7 boundaries, §12 traps |
| `docs/REQUIREMENT_TRACEABILITY.md` | BP-x.y index (§1–§11) and §14 gaps |
| `docs/ROUTES_NAVIGATION.md`, `docs/OPENAPI_CLIENT.md` | Routing registry; typed-client recipe |
| `README.md`, `docs/DEPLOYMENT.md`, `docs/BACKUP_RESTORE.md`, `docs/TESTING.md`, `docs/ADDING_A_MODULE.md` | **F062's operations runbook**: quick start, deploy/migrate/rollback, backup and restore, the test matrix and gate commands, and the extension recipe |
| `docs/FOUNDATION_REPORT.md` | **F063's Stage A report**: what shipped, the extension proof, the boundary check, BP-13's checklist judged, the G-A4 commands, and every open item. Read it before Stage B |
| `docs/DOMAIN_ARCHITECTURE.md` | **D001's Stage B map**: the module boundaries, the domain ERD (**the first three tables — `disciplines` (D002, `0010`), `departments` (D003, `0011`) and `designations` (D004, `0012`) — exist, and D005 gave them one CRUD API at `/api/v1/masters/…` (revision `0013`, no new table) which D006's three screens consume; the rest do not**) and the action/scope matrix. Its §4 records where each of the 2026-10-10 answers landed (C53–C59) and §5 what D006 checked, so it names the owning task for every rule |
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
