# FOUNDATION REPORT

The Stage A closing report — F063, and the artifact BP-14.8 asks for ("final completion summary with
real output and blockers"). It states what the domain-neutral foundation is, how the extension
contract is proven, what the boundary check is, and what is still open.

**It is not a gate result.** G-A3 and G-A4 are the operator's runs, against a pinned tree, recorded in
`docs/IMPLEMENTATION_LOG.md` (`claude_code_pack/OPERATOR_GUIDE.md` §Gates). Every number below is
attributed to the task that observed it; nothing here claims a suite passed unless a named task ran it
and wrote the number down. §5 lists the commands to run — with expected outcomes, not observed ones.

## 1. What Stage A delivered

F001–F063 built a platform with no construction-domain code in it. The shipped trees:

| Area | What exists | Tasks |
|---|---|---|
| Schema | **9 migrations**, single head `0009` (`file_assets`): baseline, RBAC, sessions, rate-limit buckets, app settings, preferences, audit log, notifications, file assets | F023, F024, F027–F029, F048, F046, F049 |
| Identity | Admin-provisioned accounts, forced first-login change, own password change, no public signup; opaque rotating HttpOnly session cookies with CSRF double-submit; rate limiting | F028–F032 |
| Authorization | M:N roles → permissions, the vocabulary in one machine copy (`app/core/permissions.py`), `require_permission(code)` on every privileged route, denial **at the API** rather than at the link | F027, F030, F031 |
| API | **29 paths / 44 operations** (`backend/openapi.json`), typed client generated from it (drift-checked in CI) | F018, F061, F065 |
| Admin screens | Users, Roles, Permissions, Settings, Audit; account lifecycle including reset and disable | F033–F040, F042 |
| Reusable app features | Notification inbox + unread bell, preferences, saved table views, files with download and report/PDF generation, Gotenberg conversion, React PDF preview | F046–F053 |
| Frontend shell | Registry-driven navigation (sidebar, palette, breadcrumbs, guards from one definition), route states (anonymous redirect, 403, 404, offline, loading), 29 shared primitives plus 2 hand-written pickers, both themes, 94 visual baselines and 14 axe scans | F011–F017, F020, F058 |
| Security | CSP, HSTS, `nosniff`, CSRF, secrets handling, redacting logs, upload caps, a no-op malware-scan seam | F060 |
| Quality | Backend: ruff format/lint, strict mypy over `app`+`tests`+`scripts`, 31 test files, three-floor coverage gate, migration round trip. Frontend: lint, format, typecheck, 68 test files, build with the dev-only exclusion checked, Playwright browser suite | F055, F056, F057, F061 |
| Operations | `README.md` quick start, `docs/DEPLOYMENT.md`, `docs/BACKUP_RESTORE.md`, `docs/TESTING.md`, `docs/ADDING_A_MODULE.md`; production Compose with Caddy and a migration job; seven-job CI workflow | F059, F061, F062 |

Counts are from the tree (`ls`, `backend/openapi.json`, `alembic heads`), not from a summary. The test
counts are the tasks' records — backend **432 passed, 2 skipped** over both legs (F056), frontend
**563 passed** (F055) — and the operator's gate run is what makes them current.

## 2. The extension contract, and how F063 proves it

`ARCHITECTURE.md` §7 and BP-9.7 require the contract to be proven by a **test-only module** that
registers one route, nav item, permission, model, migration and endpoint, and is then shown to be out
of production. `docs/ADDING_A_MODULE.md` is the recipe; F062 wrote it, F063 follows it and owes the
proof. The seams it builds on exist from F004 (backend `ScopePolicy` — documented, deliberately not
implemented), F016/F017 (`AppModule`, the registry, `buildAppRoutes`) and F027 (the permission
vocabulary).

**The proof, in two halves.**

| Half | Files | What it shows |
|---|---|---|
| Frontend | `frontend/tests/config/demo-module.tsx`, `modules.test.tsx` (**7 tests**) | the module contributes its group and route to the real registry without replacing the built-in ones; `visibleNavigation` shows the item to a holder and drops the empty group for everyone else, including `ANONYMOUS_ACCESS`; the **declaration** it makes grants nobody anything; and mounted through `buildAppRoutes(undefined, …)` — the real session boundary, not an injected fixture — the page renders for a caller the server grants, `/records` answers the 403 page for a signed-in caller without the code, and an anonymous visitor gets the login screen. Then: `APP_MODULES` is still `[]`, and no table derived from it contains `/records` |
| Backend | `backend/tests/demo_records.py`, `test_extension_contract.py` (**9 tests**) | an anonymous call is 401; a signed-in caller without the code is 403 and the body confirms nothing; a write without the write code is 403 **and writes nothing**; a holder reads only rows whose `owner_id` is theirs and writes a row that is really in the database; a foreign id is **404, not 403**; a caller holding the code the frontend declares (`demo_records.read`) is refused, because declaring a code is not registering one; `audit.record` refuses an unregistered event pair and adds no row; and Alembic's own `compare_metadata` sees the new model as an `add_table` |

**Three divergences from the guide, forced by test-only-ness, recorded rather than smoothed over**
(the module's docstring carries them; `ADDING_A_MODULE.md` §6 asks for exactly this):

1. **No `demo_records.*` permission code is invented.** `require_permission` takes a `PermissionCode`
   member so a route cannot demand a near-miss; a member added for the proof would enter the shipped
   dictionary, `ALL_PERMISSION_CODES` and every future seed. The guards use `files.read` /
   `files.create` — the codes the API actually enforces, which is what §3's rule 1 asks of any module —
   and the boundary is asserted from both sides instead.
2. **No revision ships.** A demo table in `backend/migrations/versions/` is the leakage this task
   exists to prevent. The table is created from the model inside the test transaction, and what is
   asserted is the diff the guide's `alembic revision --autogenerate` would read.
3. **No audit event is written.** `AUDIT_ACTIONS`/`AUDIT_ENTITY_TYPES` are closed vocabularies behind
   database CHECKs; the refusal is asserted rather than routed around, because registering an event
   costs a vocabulary change *and* a migration.

**Removed from production is checked, not assumed** — `test_the_test_only_extension_module_is_not_wired_into_the_application`
holds the router against the composition root: no mounted path contains `/records`, `app/api/v1/router.py`
and `app/models/__init__.py` do not mention it, and every path the extension router declares starts with
`/records`. A real module is added by mounting it and importing its model; the proof module is
therefore deleted by doing nothing.

## 3. The boundary check — no Next.js, no Redis, no domain vocabulary

BP-0.5, BP-0.6 and BP-3.1 all name F063 for the leakage check. It is now executable rather than
asserted: **`backend/tests/test_foundation_boundaries.py`** (5 tests, no database, so no `integration`
marker — `test_markers.py` fails that direction too).

It scans the trees that ship — `backend/{app,migrations,scripts}`, `frontend/src`, `frontend/public`,
plus the eight config files that carry values (`.env.example`, `.env.production.example`, both compose
files, `deploy/Caddyfile`, `index.html`, `package.json`, `pyproject.toml`) — and asserts, in order:
no forbidden **dependency** is declared (parsed from `package.json` and `pyproject.toml`); no forbidden
**import** reaches shipped source; no forbidden **artefact** exists (no `next.config.*`, no `.next/`,
and no `redis` service or image in any compose file or workflow); no **domain vocabulary** appears.
Every pattern is anchored so a *mention* is not a match — this repository describes both prohibitions
in prose on purpose, and a scan that flagged its own documentation would be deleted within a week. The
file list is asserted to exist before it is scanned, so a rename fails loudly instead of silently
narrowing the check.

Two things F063 found and fixed in that pass:

- **`backend/app/services/reports.py`** carried the only genuine Stage B vocabulary in shipped code —
  two comments about "manpower matrices", against a wide-table default that is not manpower-specific.
  Reworded to "a wide table"; no behaviour change.
- **`frontend/public/theme-init.js`** was failing `pnpm run lint` (5 errors: `no-undef` on `window` and
  `document`, one unused catch binding) since F060 shipped it. The frontend lint gate was therefore red
  for the whole of Stage A's last three tasks, and F061's CI would have gone red on its first run. Fixed
  by declaring the script's environment in `frontend/eslint.config.mjs` (`public/**/*.js`: browser
  globals, `sourceType: 'script'` — which is what the `<script src>` tag gives it) and dropping the
  unused binding. No rule was switched off.

**What the check does not do.** It is a scan of trees and dependency declarations, not a taint
analysis: a domain string assembled at runtime, or vocabulary inside a test or a document, is outside
it — deliberately, and said so in the module's own docstring.

## 4. The definition of done (BP-13), item by item

`BIG-PROMPT.txt` §13 lists **18** bullets; `docs/REQUIREMENT_TRACEABILITY.md` §11 summarises them as
"21 items" and its parenthetical omits the layout/responsive-fidelity bullet. Judged as written:

| # | Bullet | Where it stands |
|---|---|---|
| 1 | Clean checkout start, documented steps, migrations apply cleanly | F062's quick start; the migration round trip is a **gate/CI** item, last recorded clean by F049. Confirm on a clean machine (§5) |
| 2 | Real pages and APIs on persisted data; no fake buttons, stale figures or placeholder endpoints | The registry and the 44 operations; every page reads the API, and the dev-only lab is excluded from the build (checked at F055). No inert control is rendered — the context-switcher slot renders nothing when disabled |
| 3 | No Next.js, no Redis | Now a test (§3); the artefact and dependency scans are part of it |
| 4 | Versions selected, locked, documented, compatible | `docs/STACK_VERSIONS.md`; two approved deviations (TypeScript 6.0.3, jsdom 29.1.1) with reasons |
| 5 | Reference layout/nav/forms/tables/modals/both themes faithfully adapted, responsive | F015/F016/F058; 94 committed visual baselines and 14 axe scans over 9 screens |
| 6 | All 29 primitives plus form/loader/table building blocks, exercised | The reference's 29 are present name-for-name (F001's audit, re-checked against the archive at F063) in a `components/ui/` of **31** files — the additions are `calendar` (F014) and `sonner` (F018). Component tests cover them |
| 7 | Admin-only account creation/reset, forced change, own change; no public registration | F028/F029/F032/F042, tested |
| 8 | Multi-role RBAC via M:N works in DB/API/UI and denies direct calls | F030/F031 and `test_authorization.py`; F063 re-proves denial against a module route (§2) |
| 9 | Protected pages distinguish anonymous, 403, 404, offline and loading | F017's route table, F058's axe states (403, 404, unreachable server), the shell's `ErrorState` |
| 10 | Admin Users/Roles/Permissions/Settings/Audit functional with validation and privilege control | F033–F040. **The operator's walkthrough is G-A3, still due** |
| 11 | Profile/preferences and persisted column order/visibility per user across reload | F042, F048, F020/F021 |
| 12 | Inbox and unread bell: mark-read, mark-all, delete, clear-all, empty state, ownership isolation | F046/F047, tested |
| 13 | Files, reports, Gotenberg conversion, PDF preview — real and tested | F049–F053. The **live** conversion test is opt-in (`RESORS_LIVE_GOTENBERG=1`); the seam is tested without it |
| 14 | Logs redact secrets; CSRF and cookies; scoping; audit immutable to ordinary admins | F026/F027/F029/F060, tested |
| 15 | All checks green (both suites, E2E, accessibility) | **The operator's gate** — the agent's per-task records are not a substitute |
| 16 | Production Caddy SPA fallback, API proxy, HTTPS, Docker startup; no leaked ports or credentials | F059/F060. The stack was booted in a scratch environment (F059 record); **no real DNS name, certificate or load has ever been exercised** (`DEPLOYMENT.md` §14) |
| 17 | README, architecture/route maps, security, environment/operations, backup/restore, extension guide, parity, stack versions present and accurate | The §12 document table; F062 delivered the set, F063 updated the places that still said the contract would be proven "in F063" |
| 18 | Unresolved issues listed as blockers; no unrun check claimed green | §6 below |

## 5. Gate G-A4 — the operator's run

"Foundation release-ready, no domain code, production-like smoke test." Pin the tree first
(`git log -1 --format="%h %s"`, `git status --short` clean) and write the hash into the entry.

| Step | Command | Expected |
|---|---|---|
| Preconditions | `cd D:\resors; docker compose up -d --wait`; `cd backend; uv run alembic current` | Postgres healthy; `0009 (head)` — a dev database behind head serves 500s while every test is green |
| Static | `cd backend; uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`; `cd frontend; pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run build` | clean; the last one exits 0 (it runs `tsc --noEmit` first) |
| Dev-only exclusion | search `frontend/dist/` for `Development builds only`, `recharts`, `tools/components` | no match — a match means the exclusion broke |
| Suites | `cd frontend; pnpm exec vitest run`, `pnpm run coverage`; `cd backend; uv run pytest` (both legs), `uv run python -m scripts.coverage_gate` | green; the coverage gate exits 0 with `core` ≥ 85, `auth_rbac` ≥ 97 branches, `total` ≥ 95. **The integration leg fails rather than skips** with no database |
| Browser | `cd frontend; pnpm exec playwright test` (then `pnpm run test:a11y`, `pnpm run test:visual`) | green; the visual baselines are `*-quality-win32.png` |
| OpenAPI drift | `cd backend; uv run python -m scripts.export_openapi`; `cd frontend; pnpm run api:types` | no diff |
| Migration round trip | `upgrade head` → `downgrade base` → `upgrade head` on **`app_test`** only | clean, ending at head. Never `downgrade base` against `app_dev` |
| **Production smoke** | Create `.env.production` from `.env.production.example`; `cd D:\resors; docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait` | five services healthy, `migrate` exit 0; then `curl -k https://<SITE_ADDRESS>/api/v1/health` → `"environment":"production"`, and `curl -sI` on `/` shows the CSP, HSTS and `nosniff`. `down` leaves volumes intact (`down -v` deletes them) |
| Walkthrough | the admin pages, profile, preferences, the full DataTable, the denial checks, the route states | judged by **reloading**, never by a banner |
| Record | `docs/IMPLEMENTATION_LOG.md` | date, commit hash, commands with observed results, verdict. A red item becomes a fix task and the gate is re-run after it lands |

## 6. Open items and known limits

- **`/ready` — closed by `TASKS.md` F065.** `REQUIREMENT_TRACEABILITY.md` §14 **G-9** found it unowned:
  `ARCHITECTURE.md` §10 states it is part of the API contract, `conversion.health()` belonged behind it, no
  readiness route existed, and `reports/engine-health` (F053) deliberately answers a different question.
  F063 corrected the two docstrings that credited F062 with it but did **not** build it — it is a route with
  its own tests. **The operator assigned it to F065 on 2026-10-10 (C59)**, and F065 has landed:
  `GET /api/v1/ready` answers one boolean per dependency (`postgresql`, `gotenberg`, `pdf-engine`), 503
  `not_ready` only for PostgreSQL and 200 `degraded` for an optional half that is down, protected by an
  explicit refusal in `deploy/Caddyfile` rather than by a session (BP-8.3's "protected appropriately at
  ingress"). The contract is now **29 paths / 44 operations**, and the "not built" notes in `health.py`,
  C40, C41, `ARCHITECTURE.md` §10 and `DEPLOYMENT.md` §11 are retired.
- **The roles screen's stale saved cell — closed by `TASKS.md` F064.** `pages/admin/roles.tsx` re-seeded its
  draft from the pre-request cache entry on a successful save, so the save bar could persist (and a just-saved
  cell render unchanged) while the grant **was** persisted. It sat inside G-A3's scope (`OPERATOR_GUIDE.md`
  §Gates says to decide it before G-A3); **the operator assigned it to F064 on 2026-10-10 (C59)** and F064 has
  landed: the save re-seeds from the matrix it committed. Recorded as C46's one unclosed F057 finding, now closed.
- **Nothing scans uploads.** The malware seam ships as a no-op; a refusal is a 400. Never describe
  uploads as scanned.
- **Unverified paths, stated so nobody infers otherwise:** no real deployment (no DNS name,
  certificate, load or restore), **no backup ever taken** (`BACKUP_RESTORE.md` §9), **no CI job ever
  observed running** (`TESTING.md` §7), and the dev-only exclusion is checked by search rather than by
  a test.
- **Doc drift, small and now fixed:** `docs/ENVIRONMENT.md` counted the UI directory as "29 … plus
  `calendar`, `date-picker`, `time-picker` … and `sonner`" — 33 against a tree of 31, because
  `date-picker` and `time-picker` are two of the reference's 29 and the additions are `calendar` and
  `sonner`. Corrected in place. The same pass corrected the two docstrings that credited **F062**
  (documentation only) with building the readiness probe — `app/api/v1/reports.py`, whose docstring *is*
  the published `engine-health` description, so `backend/openapi.json` was regenerated with it (the
  typed client came back byte-identical) — and the sentences in `ARCHITECTURE.md` §7 and
  `ADDING_A_MODULE.md` §1/§6 that still said F063 *would* prove the contract.

## 7. What Stage B inherits

A foundation with no domain vocabulary in it, and three seams to build on: the **frontend module
registry** (`AppModule` — routes, navigation, permission declarations, a feature flag that fails
closed), the **backend router-and-guard pattern** (`require_permission` over one server-side
vocabulary), and **`ScopePolicy`** — designed in F004, documented in `ARCHITECTURE.md` §7, deliberately
not implemented, and where project scoping lands when membership becomes a real relation. The one
thing a module must not do is grant itself authority: the server registers the vocabulary, the client
only declares it, and F063's proof is the test that says so.
