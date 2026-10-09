# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the **single cold-start handoff**; `claude_code_pack/STATE.md` is now just a pointer to it.
> Last updated: 2026-10-10 — after task F027.

**Rules for Claude Code:**
- **Commit at the end of each completed task** (C13). Push, deploy and final acceptance stay with the operator.
- **The handoff's `NEXT:` line carries the task name, not just the ID** — `NEXT: F017 — error and route states`
  (operator request 2026-10-09). A bare ID forces a lookup in `TASKS.md`; the name is what makes the line
  readable on its own. Use the title exactly as `TASKS.md` writes it.
- **The operator runs all whole-suite and gate checks** (C14). Every handoff must give exact, copy-pasteable
  commands with expected outcomes. Never run or report a suite result you did not observe yourself.
- **Update this file at the end of every completed task — all six places, not the interesting ones.** On 2026-10-09
  the paste block and the header were found still naming F008 after five further tasks, because only §3/§4/§7/§8 had
  been refreshed. The full refresh list: the **header date and task**, **§1's two task IDs**, **§3 current
  position**, **§4 environment facts**, **§7 completed work**, and **§8 commands**. A stale §1 is the worst of them:
  it is the text the operator actually pastes.
- **Every completed task must add its runnable commands to §8** (start it, check it, test it), with the task ID
  that made them available. Remove or correct any command a later task invalidates. §8 is what the operator
  actually runs; it must never list a command that does not work yet.
- **Every account a task creates gets a row in §9** — email, role, purpose and which task made it. **Never put a
  password in this file**: it is committed. Password values go in the git-ignored `LOCAL_CREDENTIALS.md`, and §9
  only points there. Record a password at the moment it is generated; most are shown once.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md,
docs/ARCHITECTURE.md, docs/STACK_VERSIONS.md, NEXT_PROMPT.md and task F028 in
claude_code_pack/TASKS.md. Implement F028 only. Follow the one-task protocol.
Commit the task at the end. Update NEXT_PROMPT.md, then stop and give me the
operator checks — I run the suites myself.
```

Replace `F028` with the next ID from §3 when it changes. Read only the spec sections the task needs, and never
re-read all of `BIG-PROMPT.txt` — jump to a section using the index in `docs/REQUIREMENT_TRACEABILITY.md` §1–§11.

## 2. Where things are

| What | Path |
|---|---|
| Project root (repo) | `D:\resors` |
| Instruction pack | `claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md` (operator runbook incl. the test-command table), `STATE.md` (pointer only) |
| Task artifacts | `docs\` — `REPOSITORY_AUDIT.md` (F001), `REQUIREMENT_TRACEABILITY.md` (F002), `STACK_VERSIONS.md` (F003), `ARCHITECTURE.md` + `REFERENCE_PARITY.md` (F004), `ROUTES_NAVIGATION.md` (F016), `OPENAPI_CLIENT.md` (F018) |
| Frontend (F006) | `frontend\` — `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `openapi-ts.config.ts`, `index.html`, `src\{main.tsx,vite-env.d.ts,app\{router,providers\}.tsx,lib\{api,errors,query-keys\}.ts,lib\generated\api\}` |
| Backend (F007) | `backend\` — `pyproject.toml`, `uv.lock`, `.python-version`, `openapi.json` (generated, committed), `scripts\export_openapi.py`, `alembic.ini`, `migrations\versions\`, and `app\` (`main.py`, `seed.py`, `bootstrap_admin.py`, `core\`, `models\`, `api\v1\`, `tests\`) |
| Reference material (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip`, `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |
| Unrelated — do not touch | `D:\QTC360\` (a separate QTC360 working area) |

Reference inputs are outside the repo by design and `.gitignore` carries a safety net. Read them by absolute
path; an out-of-folder read may raise a permission prompt, which is expected. Hashes:
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed: **F027 — Admin bootstrap** (the one-time `python -m app.bootstrap_admin` CLI with no
  default credential by construction, the idempotent `python -m app.seed` role/permission seed, and
  `PermissionCode` as the single vocabulary; 31 new tests, 103 total; no migration — the identity tables
  already existed).
- **Next task: F028 — Authentication login.** "Login endpoint and session issuance", with "real DB
  integration tests" as acceptance. Everything it needs exists: `generate_session_token` /
  `hash_session_token` and the `sessions` table (F025) to issue and store the session;
  `verify_password` + `password_needs_rehash` (F026) for the credential check (a successful login rotates
  the hash forward when needed); `hit`/`peek`/`clear` with `account_key`/`ip_key` (F026) for throttling —
  a denied hit becomes the 429 with the **same body whether or not the account exists**, and the login
  must equalise timing for unknown accounts (BP-6.2g, no user enumeration). ARCHITECTURE §3 fixes the
  cookie (`__Host-session`, HttpOnly, Secure, SameSite=Lax, no Domain) and the CSRF companion token
  issued at login — F029 owns the enforcement policy. The seeded catalog (F027) provides the roles; a
  fresh database needs `python -m app.seed` first (the bootstrap CLI runs it for you). `must_change_password`
  is set on admin-provisioned accounts and is enforced on regular endpoints from F031.
- Git: branch `main`, one commit per completed task; the tree is clean after each commit. F027 sits on top of
  `ecb2bdc` (F026).
- Last human verification: the operator **opened the app on 2026-10-09** and hit
  `ReferenceError: Cannot access 'ANONYMOUS_ACCESS' before initialization` — a blank page caused by a circular
  import F017 introduced (fixed immediately afterwards; see §7). No gate suite has been run yet; F015's
  three-width check, F016's palette check and F017's route-state checks remain the operator's visual checks
  (see §8) — and the headless-browser smoke row in §8 now catches "renders nothing" without a human.

## 4. Environment facts

- Windows 11; PowerShell-first, Bash (Git Bash/MSYS2) also available. Node **v24.14.0**, pnpm **12.9.1**
  (pinned in `package.json`, honoured — no corepack switch), `uv`, git 2.49, Python 3.14. Docker not yet verified.
- Both sides are installed: `frontend/node_modules` (pnpm) and `backend/.venv` (`uv sync`, 64 packages locked).
  Neither dev server is running by default; the database container is running now.
- **Styling is live:** `frontend/src/styles/globals.css` holds the theme tokens (31 light / 30 dark, values
  verified against the reference). Tailwind 4 goes through `@tailwindcss/vite`; dark mode is the `.dark` class
  on `<html>`, not a media query — F010 supplies the provider that sets it.
- **UI primitives and tests are live:** all **29 of the source's primitives** are present in
  `frontend/src/components/ui/` — the last one, `table`, arrived with F020 — plus `calendar`, `date-picker`,
  `time-picker` (F014, all three hand-written: not registry items) and `sonner` (F018), with the
  generation-and-correction workflow
  in `ARCHITECTURE.md` §5 — after every `shadcn add` run **`pnpm run fix:ui`**, which restores components the
  generator reverted. Component tests live in `frontend/tests/components/`; Vitest config sits in `vite.config.ts`
  (jsdom + `src/testing/setup.ts`).
- **Layout shell is live (F015):** `frontend/src/components/layout/` — `app-shell.tsx` (SidebarProvider + sidebar
  + 64px header + `p-6` content, mounted as the root layout route in `app/router.tsx`), `app-sidebar.tsx` (nav
  mechanics; items arrive through a `groups` prop), `app-header.tsx`, `context-switcher-slot.tsx` (BIG-PROMPT
  §3.2a interface; disabled by default and renders **nothing**), `sidebar-preferences.ts`. Sidebar collapse is
  persisted in localStorage `app.sidebar` (`expanded`/`collapsed`), group open state in `app.sidebar.groups`;
  a first load in the 768–1023px band starts collapsed. The theme control moved from the page into the header
  (sun/moon menu with Light/Dark/System). `src/pages/` holds the current pages (the F017 placeholder and the state
  pages); `src/config/` and `src/hooks/` are no longer empty (`branding.ts`, `navigation.ts`, `modules.ts`,
  `use-mobile.ts`).
- **Navigation registry is live (F016):** `src/config/navigation.ts` is the single definition (route metadata per
  BP §4.7 + `visibleNavigation(access)` + `buildBreadcrumbs` + `buildRouteObjects`); the router's children are
  **generated from it**, and the shell filters once and hands the same list to the sidebar and the palette.
  `src/config/modules.ts` is the compiled-in module slot (`AppModule`, empty today; F063 proves it). The **access
  model** (`NavigationAccess`, `ANONYMOUS_ACCESS`, `meetsAccess`, `hasAdministrationAccess`) lives in
  `src/config/access.ts` — a **leaf module that imports nothing**, and `navigation.ts` deliberately does not
  re-export it: the registry mounts the route guard, the guard reads the access provider, the provider needs the
  anonymous default, so keeping the model inside the registry closes a cycle that blanks the app in a browser
  (F017's defect, fixed; `tests/lib/module-graph.test.ts` fails on any import cycle). Access flows through
  `components/providers/access-provider.tsx`; until F032 supplies a session the shell uses `ANONYMOUS_ACCESS` (no
  permissions, not a superuser) — the correct answer for an anonymous caller, which is why the Administration
  group is deliberately invisible today. `components/common/permission-gate.tsx` and `secure-link.tsx` share the
  same `meetsAccess` rule. `docs/ROUTES_NAVIGATION.md` is the F016 artifact.
- **Command palette is live:** Ctrl/Cmd+K (or the header search trigger, which now appears because F016 passes
  `onSearchClick`) opens it; it lists exactly the filtered registry — today that is `Overview → Dashboard`,
  nothing else, because no other page is registered yet.
- **Route states are live (F017):** `app/router.tsx` exports `buildAppRoutes(access?, routes?)` (the real table,
  built from the registry; tests mount it with fixtures) plus `appRoutes`/`router`. `/` → `/dashboard`; `/admin`
  → first permitted `/admin/*` section or the 403 page; `/403`, `/404` and `*` render the state pages inside the
  shell; every registry route carries `errorElement` and, when it declares `requiredPermissions`/`adminOnly`, an
  automatic `RouteGuard` (denial = 403, *distinct* from the F032 login redirect). `AppShell` now takes an
  optional `access` prop (default anonymous) — that is the seam F032 fills. The foundation status page is
  retired; `/dashboard` renders `pages/dashboard-placeholder.tsx` until F047 replaces it.
- **Enhanced generics are live (F017):** `components/common/` — `page-header.tsx` (breadcrumbs slot),
  `empty-state.tsx`, `error-state.tsx` (with the `offline` flavour), `loading-state.tsx` (the shell's route
  pending state uses it), `status-badge.tsx` (token-only colours; F034 is its first consumer).
- **API client foundation is live (F018):** `lib/api.ts` (the shared Axios instance — empty `baseURL` so the
  schema's relative `/api/v1` paths resolve same-origin; `VITE_API_URL` is an *origin* escape hatch only;
  `setUnauthorizedHandler` is the seam F032 fills — a 401 re-resolves once, single-flight, and `/auth/*` is never
  retried), `lib/errors.ts` (`ApiError` — one normalized shape for HTTP/network/cancel/unknown, `fieldErrors`
  from Pydantic 422s, 5xx bodies never displayed), `lib/query-keys.ts`, `components/providers/query-provider.tsx`
  (30 s staleTime; 4xx never retried, network/5xx once; cold query failures render inline, background failures and
  mutations toast), `components/ui/sonner.tsx` (generated, corrected to our theme provider — the registry tried to
  re-add `next-themes`), `app/providers.tsx` (theme → query → toaster; `main.tsx` mounts `AppProviders`).
  **Typed DTOs:** `backend/openapi.json` → `frontend/src/lib/generated/api/` via `@hey-api/openapi-ts` 0.99.0
  (types plugin only); both artefacts are committed and byte-stable — `docs/OPENAPI_CLIENT.md` has the pipeline,
  the recipe for a new endpoint, and the F061 drift check. **Tests:** MSW is wired into `src/testing/setup.ts`
  (`onUnhandledFrame: 'error'`; MSW 3 renamed that option) with the server in `src/testing/msw-server.ts`;
  `tests/lib/` holds `api-client.test.ts` and `query-provider.test.tsx`. New deps: axios 1.20.0,
  @tanstack/react-query 5.104.1, sonner 2.0.8 (+ dev: msw 3.0.2, @hey-api/openapi-ts 0.99.0).
- **Form framework is live (F019):** `components/form/` — `form.tsx` (the §5.4 pattern: Form, FormField,
  FormItem, FormLabel, FormControl, FormDescription, FormMessage and a form-level `FormError`; hand-written
  because the `base-nova` registry has **no `form` item** — `shadcn add form` exits 0 without creating a file —
  and `cloneElement` replaces Radix's `Slot`), `fields.tsx` (InputField, TextareaField, SelectField,
  CheckboxField, DateField, TimeField; values are strings — numbers/dates are the Zod schema's job),
  `form-actions.tsx` (pending state from `useFormState`; the disabled control is the duplicate-submit guard),
  `form-errors.ts` (`applyServerErrors`: Pydantic's dotted 422 paths → `setError`, `ApiError.detail` → the root
  error, previous attempt cleared), `unsaved-changes-guard.tsx` (react-router `useBlocker`; in-app navigation
  only — the tab-close prompt is a separate mechanism), and `components/common/confirm-dialog.tsx` (the §5.2b
  composite; G-2 moved it here from F013 because the guard is its first consumer). A mutation that surfaces its
  failure inline sets `meta: { suppressErrorToast: true }` (typed via TanStack's `Register`), so the form and the
  toast never say the same sentence twice. New deps: react-hook-form 7.89.0, @hookform/resolvers 5.9.1,
  zod 4.6.5.
- **DataTable is live (F020):** `components/data-table/` on **TanStack Table v9** — note the API is *not* v8:
  `tableFeatures({…})` declares features, derived row models come from feature *slots* (a missing slot silently
  skips the stage), filter/sort functions are registered by name, and the instance type is `ReactTable`. Files:
  `data-table.tsx` (features + `DataTableColumn`/`DataTableInstance` types + the component; controlled slices and
  `manualPagination`/`manualSorting`/`manualFiltering` + `rowCount` switch it to server mode), `data-table-context.tsx`
  (the `useDataTable` hook — a separate file to keep the graph acyclic), `data-table-toolbar.tsx` (search bound to
  `globalFilter`), `data-table-column-header.tsx` (sort cycling; `aria-sort` lives on the `<th>`), and
  `data-table-pagination.tsx` (the G-2 PaginationBar: range, page x of y, first/prev/next/last, rows-per-page).
  `data-table-faceted-filter.tsx` renders option counts from the *faceted* row model (they respect the other
  filters) and puts removable `FilterChip`s beside its trigger — deliberately not nested inside it, unlike the
  reference. The kit registers a `facetIncludes` filter function because `arrIncludesSome` is array-only and
  silently matches nothing on scalar columns. `components/common/search-field.tsx` debounces typing (default
  250 ms) but reports a clear immediately, and follows an external reset without echoing it. `components/ui/table.tsx`
  completes the source's 29 primitives (only `data-table-view-options` (F021), `data-table-row-actions` (first
  consumer F034) and CSV export (F022) remain of the seven source table files). New dep: @tanstack/react-table 9.2.6.
- **Table preferences are live (F021):** `components/data-table/table-preferences.ts` (the store interface +
  localStorage implementation, key `app.table.<scope>.<tableKey>`, hostile-storage tolerant) and
  `hooks/use-table-preferences.ts` (the hook pages spread into `<DataTable>`: `columnVisibility`, `columnOrder`,
  their change handlers and `reset`). `scope` is `anonymous` until F032 supplies a user id — the isolation test
  exercises the boundary today. **F048 replaces the store** via `setTablePreferencesStore`; nothing else changes.
  `data-table-view-options.tsx` is the sixth of the seven source table files: checkbox items for visibility,
  labelled move items for order (buttons, not drag — why is in ARCHITECTURE §12), and "Reset columns", which
  *removes* the stored entry rather than writing the defaults. `DataTable` gained `columnVisibility`/
  `columnOrder` + handlers and the `columnOrderingFeature`.
- **CSV export/import is live (F022):** `lib/csv.ts` — `toCsv`/`escapeCsvValue` with **formula-injection
  protection** (a leading `=`/`+`/`@`/tab/CR is prefixed with `'`; a leading `-` only when what follows is not a
  number, so `-42` survives), `parseCsv` (quoted fields, embedded newlines, all three line endings, BOM),
  `sanitizeFilename`, `downloadCsv`/`downloadTextFile` (UTF-8 BOM added at download time; object URL revoked),
  `csvTemplate`, and `importCsvRows` (headers matched by label; **every** bad row reported with spreadsheet row
  numbers; `ok` — not `records.length` — is the gate a write may branch on). `components/data-table/data-table-export.ts`
  (`exportTableCsv`, `exportTableCsvTemplate`, `csvColumnsFromTable`) exports **what the user sees**: the visible
  columns in their current order, so F021's preferences decide the file; rows default to the current page, and a
  server-mode screen passes the full set explicitly. Client-side is CSV only — XLSX belongs to the backend
  (`openpyxl`, F051).
- **The header still shows fewer controls than the reference on purpose.** CLAUDE_MASTER forbids inert buttons;
  notifications and the profile menu arrive with F046/F032 (`ARCHITECTURE.md` §12).
- **Seed and bootstrap CLIs are live (F027):** `app/seed.py` — the idempotent role/permission seed over
  `app/core/permissions.py`'s `PermissionCode` (17 codes; the single vocabulary F031/F037 will consume):
  `super_admin` (every code, and the **only** `is_system` role — its grant set is re-asserted on every run
  because F035 keeps its matrix read-only), `admin` (all except `roles.manage`/`permissions.manage`) and
  `viewer` (an explicit read set). Create-if-missing: existing permission rows and non-system roles are
  never modified; no user is ever created. `app/bootstrap_admin.py` — the one-time super-admin CLI: **no
  default credential** (password from `--generate-password`, shown exactly once, `BOOTSTRAP_ADMIN_PASSWORD`,
  or a hidden prompt; with no source it refuses, exit 2, having touched nothing); `must_change_password=True`;
  `is_superuser` **and** the `super_admin` role; refuses when an active superuser or the email already
  exists (never resets/escalates). `python-dotenv` is now a **declared dependency**: the CLI reads its two
  `BOOTSTRAP_*` variables itself, never through `Settings`. `app_dev` is already seeded (17 permissions,
  3 roles, 41 grants, **0 users** — the operator runs the bootstrap once; the accounts table §9 records it).
  **Tests:** 31 new (11 seed + 17 bootstrap + 3 generator) — `uv run pytest` is now **103 passed**.
- **Password security and throttling are live (F026):** `app/core/security.py` — Argon2id with **reviewed
  constants** (`ARGON2_PARAMETERS`: 19 MiB, t=2, p=1, the OWASP profile — deliberately *not* settings, so no
  deployment can quietly weaken hashing), `hash_password`/`verify_password`/`password_needs_rehash` (an
  unusable stored row verifies `False` and rehashes `True` — never a 500), and `password_policy_violations`
  (bounds from settings, embedded `COMMON_PASSWORDS` denylist matched case-insensitively, the user's own
  email; messages never echo the value). `User.__repr__` is hand-written — `print(user)` cannot leak the
  hash (`mapped_column(repr=False)` is dataclass-only in SQLAlchemy 2.1; ARCHITECTURE §12). New:
  `app/core/rate_limit.py` — `hit`/`peek`/`clear`, `RateLimitRule`/`RateLimitStatus` (`retry_after_seconds`
  for F028's 429), epoch-aligned fixed windows, and the `account_key`/`ip_key` helpers, over the
  `rate_limit_buckets` table (migration `0004`): one row per key, rewritten at each window rollover, counted
  by a single atomic upsert — the concurrency test races twelve real connections and every hit counts.
  Settings gained `password_min_length` (12), `password_max_length` (128), `login_max_attempts` (5),
  `login_attempt_window_minutes` (15); `.env.example` documents all four. **Tests:** 31 new (19 password +
  12 rate limit) — `uv run pytest` is now **72 passed**.
- **Session table is live (F025):** `app/models/session.py` — `UserSession` (table `sessions`), the row behind
  one login per DECISIONS C12: `token_hash` (SHA-256 digest of the cookie's value — the unique lookup key,
  with a CHECK pinning the column to exactly what `hash_session_token` returns, so the raw token cannot be
  stored), `family_id` (rotations share one), `absolute_expires_at`/`idle_expires_at` (two deadlines, ordered
  by a CHECK — idle moves on activity, absolute never), `revoked_at`/`revoked_reason` (all-or-nothing; the
  vocabulary is `REVOCATION_REASONS`), and `replaced_by_id` (unique self-FK, `ON DELETE SET NULL`).
  `is_active(now)` is the single definition of "valid". `app/core/security.py`: `generate_session_token`
  (256-bit, url-safe), `hash_session_token`, and `SESSION_TOKEN_HASH_PATTERN` — the one string the model's
  CHECK embeds. Settings gained the lifetimes ARCHITECTURE §3 marked "confirmed at F025" (idle **720 min**,
  absolute **30 days**; `.env.example` documents both). Migration `0003`. The class is `UserSession`, never
  `Session` — every consumer already has a `session` (the `AsyncSession`). Deliberately **no relationship on
  `User`**: the auth path resolves sessions by their own indexed columns. **Tests:** 18 new — `uv run pytest`
  is now **41 passed**.
- **Identity tables are live (F024):** `app/models/identity.py` holds `User`, `Role`, `Permission` and the two
  join tables (`user_roles`, `role_permissions`) in **one module** — `User.roles` and `Role.users` point at each
  other, and split modules would mean either a circular import or quoted annotations SQLAlchemy must resolve at
  mapper time. Users carry §6.1a's fields exactly (email, full_name, phone, hashed_password, is_active,
  is_deleted, is_superuser, must_change_password, password_reset_at, last_login_at, token_version) and nothing
  domain-shaped. The **database holds the invariants**: `ix_users_email` is unique and
  `ck_users_email_is_canonical` forces lowercase (so uniqueness means what it says), permission codes must match
  `resource.action` (`ck_permissions_code_is_resource_dot_action`), join-table composite primary keys are the
  "no duplicate grant" rule, and both FKs are `ON DELETE CASCADE`. `roles.is_system` marks the one role
  F035 must protect — since F027 that is exactly `super_admin` (C16). **Tests:** `backend/tests/conftest.py` runs the suite against a separate `app_test`
  database (created and migrated once per session, with `DATABASE_URL` re-pointed for the whole session so no
  test can reach development data) and rolls every test back through a savepoint — `uv run pytest` is now
  **23 passed** (5 conventions + 18 database constraints).
- **Database layer is live (F023):** `app/core/database.py` — `Base` (declarative, with the **naming convention**
  that gives unnamed constraints stable names), `UUIDPrimaryKeyMixin` (`uuidv7()`, time-ordered and generated by
  PostgreSQL 18 — verified in the container), `TimestampMixin` (`created_at`/`updated_at` as `timestamptz`,
  `updated_at` moved by the ORM's `onupdate`), a **lazy** engine (`get_engine()`/`get_sessionmaker()`, raises
  with a clear message when `DATABASE_URL` is unset, so schema export and unit tests need no database) and
  `dispose_engine()`, which `main.py`'s lifespan now calls. `DATABASE_URL` is configured from the **repository
  root `.env`** — settings locate it from the module path, because the working directory may be either the repo
  root or `backend/` (the relative `env_file` silently found nothing, which is how this was discovered).
  **Alembic:** `backend/alembic.ini` + `backend/migrations/` (async `env.py`, `target_metadata = Base.metadata`,
  `compare_type=True`, no URL in the committed ini); `migrations/versions/0001_baseline.py` is the chain's root
  and creates no tables by design — the machinery and the conventions are this task's deliverable, and each
  table arrives with the task that owns it (F024 next). `app/models/__init__.py` must re-export every new model
  module or autogenerate will not see it. **Backend tests started here:** `backend/tests/` (5 tests, no database
  needed) with `pythonpath = ["."]` in pyproject; `uv run pytest` is now available.
- **Database:** `resors-postgres` on `postgres:18.6-alpine`, published on **5432**, database `app_dev`, user
  `app`. Credentials are in the git-ignored `.env`. Verified working end to end: asyncpg 0.32.0 and SQLAlchemy
  2.1.4 both connect to **PostgreSQL 18.6** (this closed the compatibility check F003 had to defer).
- **No JWT anywhere** — C12 chose opaque session cookies, so `pyjwt`/`python-jose` are not dependencies.
- Mandated stack: React + Vite + TS strict SPA, Tailwind 4, FastAPI + async SQLAlchemy 2, PostgreSQL, uv,
  Alembic, Docker Compose, Caddy. **No Next.js, no Redis**, no public signup, one entity, AED only.
- Everything runs **same-origin**: relative `/api/v1`, Vite proxy in dev → `localhost:8000`, Caddy in prod.
- The reference archive is Next.js and is **untrusted**: never extract into the project tree, never execute it,
  never copy branding, `db_dump/*.csv` credentials, seed data, fonts or domain code.

## 5. Pending operator decisions

**None outstanding.** Everything raised so far is decided and recorded:

- **C11** pnpm · **C12** opaque rotating HttpOnly session cookies (no JWT/refresh) · **C13** agent commits each
  task · **C14** operator runs all suites, agent supplies the commands.
- **C15/C16** — F027's own decisions (bootstrap credential policy; default role catalog and seed semantics),
  solved 2026-10-10 on the operator's instruction to resolve them per best practice before implementing; the
  register rows carry the rules, ARCHITECTURE §3/§6 the rationale. Override any of it by amending the row.
- **C12's fallout is reconciled** — F025/F029/F032 were amended in `TASKS.md` to match.
- **All seven F002 gaps are closed** (`docs/REQUIREMENT_TRACEABILITY.md` §14, now a resolution table):
  G-1 `input-group`→F011; G-2 the 21 enhanced generics distributed across F009/F011–F013/F016/F017/F019/F020/
  F050/F053/F054; G-3 redirects→F017; G-4 context-switcher slot→F015; G-5 `docs/TESTING.md`→F062;
  G-6 OpenAPI typed client→F018 generates / F061 drift-checks; G-7 S3 adapter→F049, malware hook→F060,
  delegation interface already in F004, signature asset excluded.
- **Also decided:** routing mode is **data-router**; the pack **stays in `claude_code_pack/`**; **Node stays
  24.14.0** with jsdom 29.1.1 (upgrading to 24.21.0 LTS is optional and only unlocks jsdom 30).
- `DECISIONS.md` OPEN items O01–O18 block only Stage B tasks — **no Stage A task is blocked**. Never silently
  turn an OPEN item into a rule.

## 6. Gaps and constraints later tasks must honour

- **TypeScript 6 deprecates `baseUrl`** — it errors and will stop working in TS 7. Omit `baseUrl`; `paths` alone
  resolves relative to the tsconfig file. Any new tsconfig must follow this.
- **`.gitattributes` must be extended, never replaced** — `* text=auto eol=lf` (scripts/Docker/Caddy LF;
  `*.ps1`/`*.bat`/`*.cmd` CRLF), overriding the machine-wide `core.autocrlf=true`.
- **Do not "helpfully" bump the pinned deviations:** TypeScript **6.0.3** (typescript-eslint peers `<6.1.0`) and
  jsdom **29.1.1** (30.x needs Node ≥24.15.0). Full rationale in `docs/STACK_VERSIONS.md` §5.
- `docs/ARCHITECTURE.md` §7 defines the extension boundaries (`AppModule`, `ScopePolicy`,
  `ContextSwitcherAdapter`); F063 proves them with a test-only module.
- **Nothing is open** — G-8 was fixed in F014 (`REQUIREMENT_TRACEABILITY.md` §14 records the resolution).
- **One thing needs a real browser to confirm:** in jsdom an uncontrolled `Select` renders the raw value on its
  trigger (`site`) rather than the item label (`Site`) and leaves the listbox mounted. That may be an artefact of a
  layout-less DOM rather than a defect, so it is **not** asserted either way; confirm visually when Playwright
  arrives in **F057** and fix or dismiss it there.
- **`pnpm run fix:ui` after every `shadcn add`** — it restores components the generator reverted, remaps `cn`,
  strips `"use client"`, drops the `cn` package, and removes dependencies the registry reinstates (the `sonner`
  item re-added `next-themes`, which F010 rejected — `ARCHITECTURE.md` §5 item 5). **Commit before generating**:
  it restores from `HEAD`. **Check the dependency diff too**, not just the file diff.
- **Adding a page is one registry entry.** Create the page under `src/pages/`, then add a `RouteDefinition` to
  `APP_ROUTES` in `config/navigation.ts` (lazy `component`, `group`, permissions). The router mounts it, the
  sidebar and palette list it, breadcrumbs resolve it, and `requiredPermissions`/`adminOnly` automatically give
  it its 403 state and error boundary — no other file changes. **Never register a page that does not exist**: a
  registered route is a rendered link (BIG-PROMPT §1.2, no dead links).
- **An API change is two regeneration commands** (`uv run python -m scripts.export_openapi` in `backend/`, then
  `pnpm run api:types` in `frontend/`), and the resulting diff belongs in the same commit. **Never hand-edit
  `src/lib/generated/**`** — it is overwritten, and F061's drift check regenerates and diffs both artefacts.
  New code calls the API only through `lib/api.ts` (never `axios` directly) so every rejection stays an `ApiError`.
- **Identity-scoped query keys carry the user id** (`['users', userId, …]`) — see `lib/query-keys.ts`; F032 resets
  the cache on identity change, and the key shape is the second line of defence.
- **The toast rule is deliberate:** a cold query failure is rendered inline (F017's `ErrorState`), a background
  failure and a failed mutation toast. Do not "unify" them — see `docs/OPENAPI_CLIENT.md` §4.
- **Never build a CSV by hand** (F022): `toCsv`/`escapeCsvValue` own the injection guard and the quoting, and
  `downloadCsv` owns the BOM and the object-URL cleanup. Export through `exportTableCsv` when the file should
  match the screen (it reads the visible columns and their order). On import, branch on `result.ok`, never on
  `records.length`.
- **Column preferences go through `useTablePreferences`** (F021) — never read `localStorage` from a page. The
  hook owns the `app.table.<scope>.<tableKey>` key, the hostile-storage handling and the reset semantics
  (`clear`, not "write the defaults"). F048 swaps the store; pages must not assume where it points.
- **Table code must follow the v9 shape** (F020): features and their row-model slots live in
  `dataTableFeatures` in `data-table.tsx`; do not add a feature without its slot (the stage is skipped in
  silence). Filters bind through `filterFn: 'facetIncludes'` for `DataTableFacetedFilter`, never
  `arrIncludesSome` on a scalar column. Server mode always passes `rowCount` — without it the footer counts the
  rows of the current page and claims the dataset is one page long. Composed parts import `useDataTable` from
  `data-table-context.tsx`, never from `data-table.tsx`.
- **The form kit's canonical wiring** (F019): the mutation carries `meta: { suppressErrorToast: true }` and
  `onError: (error) => applyServerErrors(error, form)`; the form submits through
  `form.handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined))`. `mutate` instead of
  `mutateAsync` leaves `isSubmitting` false and the pending state never appears; the `.catch` stops the
  rejection escaping `handleSubmit` after `onError` already mapped it. One announcement per failure: the
  `FormError` alert, never a role on every field message.
- **`ConfirmDialog` lives in `components/common/`** and is controlled: `closeOnConfirm={false}` is for the
  caller that closes it when its work settles; `pending` blocks dismissals. Its first consumer is
  `UnsavedChangesGuard` (in-app navigation only — `useBeforeUnload` is a separate, later decision).
- **Database tests run against `app_test`, never the development database** (F024): request the `session`
  fixture (an async fixture must use `pytest_asyncio.fixture` in strict mode) and let the rollback clean up —
  do not truncate, do not commit outside the fixture. The one stated exception is F026's concurrency test,
  which needs real racing connections: a unique key, committed, deleted in a `finally` (ARCHITECTURE §12).
  If a test needs a schema change, add a migration.
- **Passwords only through the primitives** (F026): `hash_password` to store, `verify_password` to check,
  `password_needs_rehash` after a successful login (F028) to roll parameters forward. Run
  `password_policy_violations` **before** hashing at the API boundary; never return `hashed_password` in a
  schema; never build an Argon2 parameter set by hand — `ARGON2_PARAMETERS` is the reviewed one. Throttling
  goes through `hit()`/`peek()`/`clear()` and `account_key()`/`ip_key()`; never hand-roll counting, and never
  build bucket keys outside the helpers (one account must not silently get two budgets). A denied hit is
  F028's to turn into a 429 — with the same body whether or not the account exists (BP-6.2g).
- **The bootstrap is one-time and credential-free by construction** (F027): never add a `--password` flag, a
  default password, or a fallback account — with no password source the CLI refuses (exit 2) and writes
  nothing. The policy runs before hashing on every path, the generated one included. The two `BOOTSTRAP_*`
  variables are read by the CLI alone (python-dotenv); **do not add them to `Settings`** — no bootstrap
  secret may load into the API process. The bootstrap account carries `is_superuser`, the `super_admin`
  role, and `must_change_password=True`; re-running never resets or escalates an existing account, and a
  retired (inactive/deleted) superuser deliberately does not block a re-bootstrap (fail-closed login would
  otherwise strand the operator).
- **The seed owns only what it created** (F027): `seed(session)` is idempotent create-if-missing — never
  update an existing permission row or a non-system role (F036/F037 own edits after creation); only
  `super_admin` is re-asserted (every registered code + `is_system=true`), because F035 keeps its column
  read-only. The vocabulary is `app/core/permissions.py`'s `PermissionCode` — never hand-write permission
  strings; F031's guards and F037's dictionary consume the same enum. `python -m app.seed` is safe to run
  at any time; a caller of `seed()` owns the transaction.
- **Invariants belong in the database** (F024): uniqueness, canonical form and code shape are CHECKs/indexes, not
  conventions in service code. When a new rule can be expressed in DDL, express it there and test the
  `IntegrityError` — the API validates first for a readable message, the constraint is what makes it true.
- **The session row *is* the session** (F025): end one by revoking it (`revoked_at` + a `revoked_reason` from
  `REVOCATION_REASONS`), never by deleting the row — F029's replay detection works by finding a family member
  revoked as `rotated`. Store only `hash_session_token(...)` output in `token_hash`; the CHECK accepts nothing
  else, and the raw token goes to the cookie and nowhere else. A rotation is one transaction: insert the
  successor, then revoke the predecessor with `reason="rotated"` and `replaced_by_id=successor.id`. After a
  Core `update()`/`delete()`, rows already loaded in the same session are **stale** — re-read with
  `populate_existing=True` (ARCHITECTURE §12).
- **Schema conventions are set once and never re-decided** (F023): new tables use `UUIDPrimaryKeyMixin` +
  `TimestampMixin` and are declared on `app.core.database.Base`, so they inherit `uuidv7()` keys, `timestamptz`
  instants and the naming convention. One migration per schema change, hand-numbered
  (`uv run alembic revision -m "..." --rev-id 0002`), applying to an empty database and coming back down
  (ARCHITECTURE §9). Every model module is re-exported from `app/models/__init__.py` — autogenerate only sees
  what has been imported. **Never edit a migration that has been applied**; add the next one.
- **Backend commands run from `backend/`**, and `.env` lives at the **repository root** — settings find it by
  path, but compose and `psql` examples assume the root. `alembic upgrade head` needs `DATABASE_URL`, which is
  the root `.env`'s; a missing value raises a named error rather than a connection attempt to nowhere.
- **Import cycles are fatal in a browser and invisible everywhere else.** `tsc`, `vite build` and Vitest all
  tolerate them; native ESM throws `Cannot access 'X' before initialization` and the page renders nothing (F017's
  blank page). `tests/lib/module-graph.test.ts` fails on any cycle in `src/` — never make it "expected". The
  trigger is a **module-scope read** (`createContext(ANONYMOUS_ACCESS)`); function-body reads survive cycles. The
  access model is the worked example: it lives in the leaf `config/access.ts` and is imported from there, never
  re-exported through `navigation.ts`.
- **`RouterProvider` renders the route tree only** — `<RouterProvider>{extra}</RouterProvider>` silently drops
  `extra`; put extra UI inside a route element (`ARCHITECTURE.md` §12, learned in F016).
- **The 403 page is not the login redirect.** Route guards deny with the 403 UI; the anonymous → `/login`
  redirect is F032's and must stay separate (§4.6), or a permission error reads as "log in again".
- **`StatusBadge` uses existing tokens only** (primary / muted-foreground / destructive). Adding an
  emerald/amber success-warning pair would grow the design system §1.2 froze — add a theme token first, in
  `globals.css`, the way F009 did.
- **Two source behaviours were deliberately not copied in F015** (recorded in `ARCHITECTURE.md` §12): the
  reference re-forces its viewport default on every load and resize, discarding the stored collapse preference —
  here the viewport only decides the first load with nothing stored; and the reference's edge chevron is anchored
  to no positioned ancestor, escaping to the viewport edge — the wrapper here is `relative`.
- **Read `docs/ARCHITECTURE.md` §12 (Implementation notes) before debugging anything in the frontend.** It records
  the traps that cost the most time in F011–F014: minifiers rewriting values and quotes so that hand-written checks
  produce false failures, most failing component tests being wrong expectations rather than defects (dump the DOM
  before changing code), overlay test-state leaking between tests, and the jsdom gaps that need shims.
- Handoff convention: this file is the single source of truth; `STATE.md` is a state-free pointer (a practical
  rather than literal reading of `CLAUDE_MASTER.md` item 7).

## 7. Completed work (newest first)

- **F027 — Admin bootstrap.** The platform's first account and the seeds that make it grantable, with the
  acceptance being what the CLI *refuses* to do. `app/bootstrap_admin.py`: the password comes from
  `--generate-password` (shown in the console **exactly once** — it is a temporary credential),
  `BOOTSTRAP_ADMIN_PASSWORD`, or a hidden prompt; with no source the CLI exits 2 having touched nothing —
  the "no default credentials" tests prove that structurally by injecting a session factory that raises if
  it is ever called. Every password runs the F026 policy before hashing (generated ones included, because
  the uniform path is the rule); the email is validated with the same `EmailStr` validator F033's API will
  use — which is why `.env.example`'s placeholder moved to `admin@example.com`: `.invalid` is a special-use
  domain the validator rightly rejects — and canonicalised to lowercase before insert. The account is
  `is_superuser=True` **and** holds `super_admin` (the flag is the bypass the access model evaluates; the
  role is the visible, revocable grant in F036's matrix) with `must_change_password=True` (BP-6.1b: the
  operator's password is temporary). One-time semantics: refuses when an active superuser exists or the
  email is taken (never resetting or escalating an existing row); a retired superuser deliberately does
  not block; racing first runs serialise on a transaction advisory lock. The CLI reads its `BOOTSTRAP_*`
  variables itself via `python-dotenv` (now a declared dependency) — never through `Settings`, so no
  bootstrap secret loads into the API process. `app/seed.py` + `app/core/permissions.py`: `PermissionCode`
  (the 17 codes ARCHITECTURE §6 fixes, with descriptions) and the three-role catalog — `super_admin`
  (every code, `is_system=True`, re-asserted each run so codes registered later flow to it), `admin` (all
  except `roles.manage`/`permissions.manage`) and `viewer` (the explicit read set) — create-if-missing,
  never touching existing permission rows, non-system roles or users. `main` is async (`__main__` wraps
  it in `asyncio.run`) so tests drive it on the fixture's loop; ARCHITECTURE §12 records that design and
  the Git Bash `isatty()` trap it sidesteps. Checks run: `uv run pytest` **103 passed** (31 new: 11 seed +
  17 bootstrap + 3 generator); `ruff check`/`format --check` clean; `mypy app migrations` clean (23 files);
  **no migration** — the identity tables already existed (`0004` remains head); `python -m app.seed` run
  twice against `app_dev` (17 permissions, 3 roles, 41 grants; second run reports nothing to do); the
  bootstrap refusal path verified live (exit 2, `Nothing was created.`), `app_dev` users still 0, and
  `app_test` is left empty after the suite.
- **F026 — Password security.** `app/core/security.py` grew the password half it was written to hold.
  **Argon2id at a reviewed profile** (19 MiB, t=2, p=1 — the first OWASP-listed parameter set), kept as
  constants rather than settings: the configurable parts are the ones users experience (12–128 characters,
  the denylist, throttling), because a deployment that can weaken the hash function through an environment
  variable will eventually do it. Three properties are tested as rules rather than left to convention: the
  stored value never contains the password; an unusable stored hash *verifies False and rehashes True*
  instead of raising (an unusable credential is a failed login, not a 500); and a policy message never
  echoes the candidate — with a canary-value test, because asserting "the message never contains `password`"
  trips on the English word. The no-composition-rules decision (length + denylist instead of mixed
  case/digit/symbol) is documented in the module: composition rules push people toward `Pa55word!`, exactly
  what the denylist catches. `User.__repr__` is now hand-written so `print(user)` cannot leak the hash —
  `mapped_column(repr=False)` turned out to be a dataclass-only argument in SQLAlchemy 2.1 and fails at
  import on a plain `DeclarativeBase` (recorded in ARCHITECTURE §12). **Rate limiting** is DB-backed, no
  Redis: `app/core/rate_limit.py` implements fixed-window primitives (`hit`, `peek`, `clear`,
  `RateLimitRule`, `RateLimitStatus` with `retry_after_seconds` for F028's 429) over the
  `rate_limit_buckets` table (migration `0004`), one row per key — rewritten at each window rollover, so the
  table stays the size of the key space. The concurrency story is one statement, not a lock:
  `INSERT … ON CONFLICT DO UPDATE … RETURNING` with a CASE that compares the stored window, and the test
  races **twelve real connections** and asserts every racing hit returned a distinct count 1..12 — a
  SELECT-then-UPDATE rewrite passes every other test and fails that one. Login attempts are keys
  (`login:account:*`, `login:ip:*`), not a second table (BP-8.2h allows either; the generic one serves
  F060 too). Checks run: `uv run pytest` **72 passed**; `ruff check`/`format --check` clean; `mypy app
  migrations` clean (20 files); `0004` applied to `app_dev` (verified with `\d rate_limit_buckets`), round
  trip `downgrade 0003`/`upgrade head` clean; `app_test` left empty after the suite — including the
  concurrency test's own row, which it deletes in a `finally`.
- **F025 — Session data model.** `app/models/session.py` declares `UserSession` (table `sessions`) — the row
  behind one login under DECISIONS C12 — and migration `0003` was autogenerated from it and reviewed against
  the models. The decisions are all about which states the table can represent. **Two deadlines, not one**:
  `absolute_expires_at` never moves and `idle_expires_at` moves on activity, with a CHECK keeping idle at or
  below absolute — one column would conflate "signed in last Tuesday" with "live since June". **Revocation is
  all-or-nothing** (CHECK: timestamp present ⇔ reason present) over a **closed vocabulary**
  (`REVOCATION_REASONS`; `rotated` is what F029's replay detection matches on), so "who ended this session,
  and why" stays queryable. **Replacement is a chain**: `replaced_by_id` is a unique self-FK (a session
  replaces exactly one predecessor, so a fork is impossible) with `ON DELETE SET NULL`, so pruning a successor
  cannot erase the record of a rotation. **The hashed-token contract is shared, not restated**:
  `app/core/security.py` exports `SESSION_TOKEN_HASH_PATTERN`, the model embeds it in
  `ck_sessions_token_hash_is_sha256_hex`, and `hash_session_token` is written against it — the database cannot
  accept a raw token, an Argon2 string or a truncated digest, even from psql. SHA-256 (not a password hash) is
  the right tool: the token is 256 bits of `secrets` randomness, so there is nothing to slow down, and the
  module says so for whoever reads it before F026. Deliberately **no relationship on `User`**: `selectin`
  would add a query to every authenticated request and logout-all is a bulk UPDATE, not a relationship walk.
  Settings gained the lifetimes ARCHITECTURE §3 marked "confirmed at F025" (idle 12 h / absolute 30 days,
  overridable, documented in `.env.example`) and the class is `UserSession` — every consumer already has a
  `session`. Tests: 15 against `app_test` (`test_session_model.py` — constraints, user cascade, the unique
  replacement chain, `SET NULL` on successor delete, the family-revocation rehearsal F029 will fire, and the
  `is_active` matrix) + 3 database-free (`test_session_tokens.py` — 256-bit url-safe tokens, the digest shape
  the CHECK accepts, the confirmed lifetime defaults). Checks run: `uv run pytest` **41 passed**;
  `ruff check`/`format --check` clean; `mypy app migrations` clean; `0003` applied to `app_dev` (verified with
  `\d sessions` — all four checked constraints, both FKs and four indexes present) and to the fixture's
  `app_test`; `upgrade head` → `downgrade base` → `upgrade head` clean, and `app_test` is left empty after the
  suite. One trap recorded in ARCHITECTURE §12: a Core UPDATE bypasses the identity map, so rows read back in
  the same session are stale without `populate_existing=True` — the family test would otherwise have passed
  for the wrong reason.
- **F024 — User RBAC models.** `app/models/identity.py` declares users, roles, permissions and both join
  tables, and Alembic autogenerated `0002` from them — reviewed against the models, which is the review that
  matters: a hand-edited migration that disagrees with the model is a lie that only shows up in production. The
  interesting decisions are all about *where* the rules live. Uniqueness and canonical form are in the database
  (`ix_users_email` unique plus `ck_users_email_is_canonical`, so `Ada@…` and `ada@…` cannot both exist even if a
  script inserts them), permission codes must be `resource.action`, the join tables' composite keys are the
  no-duplicate-grant rule, and `ON DELETE CASCADE` is what makes F033/F035's deletes safe. The models were
  merged into one module after ruff's UP037 pointed at the quoted forward references: `User.roles` ↔ `Role.users`
  across two modules needs either a circular import or annotations resolved at mapper-configuration time, and one
  module removes the problem rather than managing it. The bigger deliverable is the **test fixture**: a separate
  `app_test` database, created and migrated once per session, with `DATABASE_URL` re-pointed for the whole
  session and each test wrapped in a savepoint-joined transaction that rolls back — after a run the `users` table
  is empty, which is the proof. 18 constraint tests, plus the 5 from F023. Two smaller findings recorded:
  `pytest_asyncio.fixture` is required for async fixtures in strict mode (a plain `pytest.fixture` errors with
  "no plugin or hook that handled it"), and Alembic warns without `path_separator = os` in its ini. Checks run:
  `uv run pytest` **23 passed**; `ruff check`/`format --check` clean; `mypy app migrations` clean; `alembic
  upgrade head` applied 0002 to both `app_dev` and the fixture-created `app_test`.
- **F023 — Database base migration.** The backend's persistence layer, and the conventions every later table
  inherits — which is why they are settled once, in code, with nothing table-shaped in the way. `Base` carries a
  **naming convention** (an unnamed `UniqueConstraint` still reaches PostgreSQL as
  `uq_<table>_<columns>`, so a later `ALTER`/`DROP` in a migration can name what it changes); `UUIDPrimaryKeyMixin`
  gives time-ordered `uuidv7()` keys (PostgreSQL 18 generates them — verified in the container, and the reason
  inserts append to the primary-key index instead of scattering); `TimestampMixin` stores `created_at`/
  `updated_at` as `timestamptz`, with `updated_at` moved by the ORM (a raw SQL update would not — recorded).
  The engine is **lazy**: importing the module never needs a database, so `export_openapi.py` and the unit tests
  keep working on a machine without one, while `get_engine()` raises a named error if asked without
  `DATABASE_URL`. Alembic is wired async (`migrations/env.py`, `target_metadata = Base.metadata`,
  `compare_type=True`) with **no URL in the committed ini** — the engine comes from settings, so the CLI and the
  app can never point at different databases. The first revision creates no tables *on purpose*: it is the
  chain's root, and each table arrives with the task that owns it. Verified by running it against the real
  PostgreSQL 18.6: `upgrade head` → `downgrade base` → `upgrade head` again (no-op second time), `--sql` offline
  mode included. Two things were found the hard way and are now recorded: `.env` lives at the **repository
  root** (a relative `env_file` found nothing when running from `backend/` — settings now locate it by path),
  and DDL assertions must compile **with the postgres dialect** or the test sees `DATETIME`/`CHAR(32)` instead of
  `TIMESTAMP WITH TIME ZONE`/`UUID`. Backend tests start here: `backend/tests/test_database_conventions.py`,
  5 tests, no database required. Checks run: `uv run pytest` 5 passed; `uv run ruff check`/`format --check`
  clean; `uv run mypy app migrations` clean; the migration cycle above; `select version()` through the app
  engine → PostgreSQL 18.6.
- **F022 — DataTable import export.** `lib/csv.ts` holds the whole boundary: writing neutralises spreadsheet
  formulas (`= + @`, tab and CR — plus `-` when what follows is not a number, which keeps `-42` an amount),
  quoting follows RFC 4180, filenames are sanitised, and downloads carry a UTF-8 BOM with the object URL revoked
  in the same turn. Reading is a real parser (quoted fields, embedded newlines, CRLF/CR/LF, BOM) and
  `importCsvRows` matches headers by label, reports **every** bad row with spreadsheet row numbers, and returns
  valid records beside the errors so `ok` is the only thing a caller can branch a write on — no silent partial
  writes. `data-table-export.ts` ties it to the table: the export carries the *visible* columns in their current
  order, so the preferences F021 persists decide what lands in the file, and rows default to the page on screen
  (a server-mode screen passes the full set explicitly rather than shipping a page and calling it a dataset).
  Two test traps are recorded in ARCHITECTURE §12: `Blob.text()` and a default `TextDecoder` both strip a leading
  BOM (so assert the bytes), and jsdom has no `URL.createObjectURL` (stub it, and capture the click — the anchor
  is gone by the next line). Checks run: **416 tests across 49 files, all passing** (+59 across two new files);
  typecheck exit 0; build exit 0.
- **F021 — DataTable preferences.** The persistence F020 left out, as an *abstraction* rather than a feature of
  the table: `table-preferences.ts` defines `load`/`save`/`clear` plus the localStorage implementation, and
  `useTablePreferences(tableKey)` returns the slices the DataTable already accepts — so a page persists columns
  by spreading one hook. Keys are `app.table.<scope>.<tableKey>`: the scope is the user, `anonymous` until F032
  supplies a session, and the test proves two scopes do not share, which is the boundary F048's server store will
  sit behind (`setTablePreferencesStore`). Storage is treated as hostile — corrupt entries, another version's
  shape and private-mode throws all read as "no preference". `DataTableViewOptions` (the sixth of the source's
  seven table files) toggles visibility, moves columns with labelled buttons rather than drag, and resets —
  where "reset" *deletes* the entry, because "no preference" and "defaults" are the same thing and the smaller
  record is the honest one. Base UI's menu rules cost a round to learn and are recorded in ARCHITECTURE §12
  (labels need a group or they throw; items fire `onClick`, not Radix's `onSelect`; checkbox items keep the menu
  open; the menu mounts asynchronously, so a synchronous query right after the trigger click finds nothing).
  Checks run: **357 tests across 47 files, all passing** (+20 across two new files); typecheck exit 0; build
  exit 0.
- **F020 — DataTable core.** `components/data-table/` delivers the table on **TanStack Table v9** — a different
  API from the v8 the reference uses (declared features, row-model *slots*, registered filter/sort names,
  `ReactTable`), recorded in ARCHITECTURE §12 because it is invisible until something quietly stops working.
  `DataTable` sorts, searches, filters and paginates in the browser and does the same thing in server mode with
  `manual*` + `rowCount` — one component, two modes, asserted by fixture tests that show the server path does not
  slice or reorder locally. The faceted filter counts options through the faceted row model (so counts respect
  the other filters) and renders its chips beside the trigger; the kit registers `facetIncludes` because the
  built-in `arrIncludesSome` matches nothing on a scalar column while looking perfectly wired. `SearchField`
  debounces typing but reports a clear at once, and `FilterChip` keeps its remove control as the only button.
  `ui/table.tsx` is the last of the source's 29 primitives. The module-graph guard caught a real cycle while
  building this (`data-table` ↔ its footer) — fixed by the leaf `data-table-context.tsx`, exactly as F017's
  access model was. Deferred on purpose, with owners: view options (F021 — the feature is enabled, the
  persistence is F021's), row actions (F034's first consumer), CSV (F022). Checks run: **337 tests across 45
  files, all passing** (+23 across three new files and the guard); typecheck exit 0; build exit 0.
- **F019 — form framework.** `components/form/` now holds the §5.4 form kit, built on a hand-written `form.tsx`
  (the `base-nova` registry has no `form` item — `shadcn add form` exits 0 creating nothing; `cloneElement`
  stands in for Radix's `Slot`, and `FormControl`'s child type states the three props a control must forward).
  The reusable fields (`InputField`, `TextareaField`, `SelectField`, `CheckboxField`, `DateField`, `TimeField`)
  render label + required marker + control + description + message and get `aria-invalid` and one
  `aria-describedby` chain by construction; `DatePicker`/`TimePicker` had to learn to forward
  `aria-describedby`/`invalid` — without that the injection would have vanished silently. **Server mapping:**
  `applyServerErrors` turns F018's `ApiError.fieldErrors` into RHF field errors, always sets a root error from
  `ApiError.detail`, and clears the previous attempt's; `FormError` renders that root error as the single
  `role="alert"` per form. `FormActions` reads `isSubmitting` from context — which required fixing the
  `mutate` → `mutateAsync` wiring pitfall, documented in the kit — and the disabled control is the
  duplicate-submit guard (asserted as state, because jsdom dispatches clicks on disabled buttons whereas a
  browser cannot). `ConfirmDialog` (G-2, moved from F013) plus `UnsavedChangesGuard` cover the unsaved-change
  prompt on a real data router. The **mutation-toast opt-out F018 promised** landed here:
  `meta: { suppressErrorToast: true }`, typed through TanStack's `Register`. Also fixed: a `Button` with
  `loading` had its accessible name rewritten to "Loading <label>" by the Spinner's own live region — now
  `aria-hidden`, with `aria-busy` carrying the state. Checks run: **314 tests across 42 files, all passing**
  (+23 in four new files); typecheck exit 0; build exit 0.
- **F018 follow-up — the blank page, fixed (F017 regression).** The operator opened the app and got
  `ReferenceError: Cannot access 'ANONYMOUS_ACCESS' before initialization` with an empty `#root`. Cause: F017's
  `buildRouteObjects` made `navigation.ts` import `RouteGuard`, closing the cycle
  `navigation → route-guard → access-provider → navigation`; `access-provider.tsx` reads `ANONYMOUS_ACCESS` at
  module scope, so whenever evaluation entered through `navigation.ts` the binding was still in its TDZ. Every
  F017 check was green — `tsc`, `vite build` and Vitest all tolerate the cycle, and the "smoke test" was HTTP
  fetches (module *serving*, not evaluation). Reproduced in headless Chrome against the dev server, fixed by
  moving the access model into a leaf `config/access.ts` (imported from there by the provider, the guard, the
  gate, the shell and the tests; **not** re-exported through `navigation.ts`, which would re-close the cycle), and
  guarded by a new `tests/lib/module-graph.test.ts` that fails on any static-import cycle in `src/` (verified red
  on the old graph, green after). Verified again the same way afterwards: dev server **and** production build
  both render the shell in headless Chrome with a clean console; `/admin` still shows the 403. §8 gained the
  headless-browser row so "renders nothing" can be caught without a human.
- **F018 — API client foundation.** The whole request path now exists, in one shape. `lib/api.ts` is the only
  Axios instance: empty `baseURL`, so the paths the OpenAPI schema uses (`/api/v1/...`) resolve against whatever
  served the SPA — Vite proxy in dev, Caddy in prod — with `VITE_API_URL` kept as an origin-only escape hatch.
  `lib/errors.ts` normalizes **every** rejection into an `ApiError` (HTTP / network / cancelled / unknown) with
  field-addressable 422 entries (`loc` minus its `body`/`query` prefix → dotted paths), the request id when the
  server sends one, and one hard rule: **a 5xx body is never displayed** (§6.2f). The 401 policy is the opaque-cookie
  one ARCHITECTURE §3 chose: no refresh call, a single-flight re-resolution through `setUnauthorizedHandler` (F032
  fills it), one retry, never for `/auth/*`. `components/providers/query-provider.tsx` scopes the `QueryClient`
  (30 s stale time; 4xx and cancellations never retried, network/5xx once; mutations never) and decides where a
  failure is *visible*: cold failures belong to the page's F017 `ErrorState`, background failures and failed
  mutations toast — asserted against the real `<Toaster />`, not a mock. `app/providers.tsx` stacks theme → query →
  toaster and `main.tsx` mounts it. **Typed DTOs come from the backend:** `scripts/export_openapi.py` writes
  `backend/openapi.json` by importing the app (no server, no DB — CI-safe), `@hey-api/openapi-ts` 0.99.0 turns it
  into `src/lib/generated/api/` with the types plugin only; both artefacts are committed and **byte-stable**
  (hash-verified), which is what makes F061's drift check a plain `git diff --exit-code`. The generator was chosen
  on registry evidence — `openapi-typescript` 7.13.0 still peers `typescript ^5.x` and would drag in a second TS
  copy, while `orval` would duplicate the hand-written client (`STACK_VERSIONS` §3). `shadcn add sonner` tried to
  reinstate `next-themes`; the component now reads our theme provider and `fix:ui` gained a step 5 that removes
  such dependencies — recorded in ARCHITECTURE §5/§12 together with the MSW 3 option rename
  (`onUnhandledRequest` → `onUnhandledFrame`) and the Python CRLF trap (`write_text(..., newline="\n")`).
  `docs/OPENAPI_CLIENT.md` is the artifact. Checks run: **290 tests across 37 files, all passing** (+28 in
  `tests/lib/`); typecheck exit 0; build exit 0 — entry chunk 621.93 kB → 734.67 kB (the same >500 kB warning the
  previous build already printed; splitting stays F058's).
- **F017 — error and route states.** The route table became a function, `buildAppRoutes(access?, routes?)` in
  `app/router.tsx`, so tests mount the **real** table with fixture routes instead of re-declaring it. `/`
  redirects to `/dashboard` (F032 makes it auth-aware); `/admin` goes to the first `/admin/*` section the caller
  may open — `firstPermittedAdminPath` skips detail routes — and to the **403 page** when there is none, which is
  today's truth (no admin route is registered until F034). `buildRouteObjects` now gives every registry route an
  `errorElement` (a page crash keeps the frame: the error boundary renders *inside* the shell) and wraps every
  route with `requiredPermissions`/`adminOnly` in `RouteGuard`, so a route cannot be registered without its
  denial state. The 403 is deliberately distinct from F032's login redirect (§4.6), and neither the guard nor
  the boundary renders anything from the thrown error (§6.2f, no leak). New: `pages/forbidden.tsx`,
  `pages/not-found.tsx`, `pages/dashboard-placeholder.tsx` (the protected placeholder the retired foundation
  status page hands over to; `status` left the registry), `layout/{route-guard,route-error,admin-redirect}.tsx`,
  and the five enhanced generics in `components/common/` — PageHeader (with the breadcrumbs slot F016 promised),
  EmptyState, ErrorState (`offline` flavour for §6.2f's retry UI), LoadingState (now the shell's pending state,
  and the nested Spinner's own live region is suppressed so the wait is announced once), StatusBadge
  (token-only colours). `AppShell` gained the optional `access` prop — the seam F032 fills. Honest correction:
  F016's entry said `AppBreadcrumbs` was "finished and tested"; the *trail builder* was, the renderer was not, so
  it gained a component test and the F017 placement rule (a single crumb repeats the page title — it renders
  from two up). Checks run: **262 tests across 35 files, all passing**; typecheck exit 0; build exit 0 (the
  placeholder page splits into its own chunk).
- **F016 — navigation registry.** `config/navigation.ts` now holds the whole navigation contract: `RouteDefinition`
  with the §4.7 metadata (including a `:param`-aware breadcrumb factory), `NavigationAccess` + `meetsAccess` as the
  single visibility rule, `visibleNavigation()` (drops empty groups — §4.8), `buildBreadcrumbs()` and
  `buildRouteObjects()`. The router's children are generated from it, pages load lazily (the build emits one chunk
  per page), and the shell filters **once** and passes the same list to the sidebar and palette
  (§4.10). New: `config/modules.ts` (compiled-in `AppModule` slot), `providers/access-provider.tsx` (fail-closed
  anonymous default; F031/F032 supply the real value), `common/permission-gate.tsx` + `secure-link.tsx` (UX only,
  §6.3d), `layout/command-palette.tsx` (Ctrl/Cmd+K; header trigger now renders), `layout/app-breadcrumbs.tsx`
  (finished and tested, **not mounted** — §5.2b gives PageHeader a breadcrumbs slot, so F017 places it).
  `docs/ROUTES_NAVIGATION.md` records the model, the registered route, the access rules and every planned page with
  its owning task. Also dropped one more dead `no-scrollbar` in `ui/command.tsx` (same reason as F015's sidebar).
  Test-round lesson: `<RouterProvider>{extra}</RouterProvider>` silently renders nothing — the extra UI must be
  inside a route element; recorded in `ARCHITECTURE.md` §12. Checks run: **233 tests across 32 files, all
  passing**; typecheck exit 0; build exit 0.
- **F015 — layout shell.** `ui/sidebar.tsx` came from the registry and took four corrections (all in its header
  comment): the §1.2 geometry (260px expanded / 64px rail / 260px drawer — generated defaults were 16rem/3rem),
  no cookie (the preference is the app's, in localStorage; nothing here is server-rendered), `no-scrollbar`
  dropped (that utility lives in `shadcn/tailwind.css`, which we do not import, so it styled nothing), and
  `relative` on the wrapper. That last one is a source bug **not** copied — the reference's `absolute -right-3`
  chevron has no positioned ancestor and escapes to the viewport edge. New `components/layout/`: `app-shell`
  (now the root layout route), `app-sidebar` (collapsible groups, persisted group state, active-row
  `aria-current` + `data-active`, scroll-into-view, rail tooltips, Ctrl/Cmd+B), `app-header` (64px, hamburger +
  brand below `md`), `context-switcher-slot` (§3.2a/ARCHITECTURE §7 — disabled renders nothing; enabled renders
  a working selector), `sidebar-preferences` (also the first-load viewport rule). The theme control moved into
  the header as a sun/moon menu keeping all three modes explicit. The header deliberately renders no search
  trigger, bell or avatar yet — their owners pass real handlers in F016/F046/F032; a dead control would violate
  "no inert buttons". Checks run: **196 tests across 29 files, all passing**; typecheck exit 0; build exit 0.
- **F014 — picker and command primitives.** `select`, `tabs`, `collapsible`, `command` and `calendar` came from the
  registry; **`date-picker` and `time-picker` are not registry items** (the reference hand-built both too), so they
  are composed here from Popover + Calendar and from hour/minute/period columns, with a new `src/lib/format-date.ts`
  storing ISO calendar days rather than `Date` objects. 26 components in `components/ui/`. **G-8 is fixed**: the
  Tooltip now supplies one `useId` per instance through a context, so the trigger's `aria-describedby` resolves to
  the popup's `id` — F013's reasoning that a dangling reference would be "worse than the omission" was over-cautious
  and is corrected in the record. **The generator reverted five more files** this time (`button`, `dialog`, `input`,
  `textarea`, `input-group`), so the whole correction pass is now a single command, `pnpm run fix:ui`. Findings that
  were my assumptions, not defects: Base UI Tabs uses **manual activation** (arrows move focus, Enter selects — a
  valid ARIA pattern); cmdk highlights the first match immediately; jsdom lacks `scrollIntoView` and pointer-capture,
  now shimmed. Checks run: **171 tests across 25 files, all passing**; typecheck exit 0; build exit 0.
- **F013 — overlay primitives** — Dialog, DropdownMenu, Popover, Tooltip, Sheet, ScrollArea with focus/escape tests;
  found that the registry's Tooltip set no `role="tooltip"` and that generators revert dependency components.
  _`git show 3ad6fe8`_
- **F012 — basic UI primitives B** — Card, Separator, Skeleton, Spinner, Progress, Avatar, Breadcrumb.
  _`git show def322e`_
- **Older:** F011 primitives A · F010 theme provider · F009 theme tokens · F008 PostgreSQL · F007 backend
  bootstrap · F006 frontend bootstrap · F005 structure · F004 architecture · F003 stack · F002 traceability ·
  F001 audit. _`git log`_

## 8. Commands — what you can run

Everything listed here works **today**. Each row names the task that made it available. Anything marked
*not yet* has no runner; it arrives with the task shown, and belongs to the owner of that task to add here.
The fuller table (including future suites) lives in `claude_code_pack/OPERATOR_GUIDE.md`.

### Start everything

| What | Command | What you should see |
|---|---|---|
| **Database** (F008) | `cd D:\resors; docker compose up -d --wait` | `resors-postgres  ... Healthy`, published on **5432** |
| **Frontend** (F006) | `cd D:\resors\frontend; pnpm run dev` | `VITE v8.3.4 ready` → open **http://localhost:5173**: `/` redirects to `/dashboard`, rendered **inside the shell** (sidebar + 64px header since F015); **Ctrl+K** opens the palette (F016) |
| **Backend API** (F007) | `cd D:\resors\backend; uv run uvicorn app.main:app --reload --port 8000` | `Application startup complete` → open **http://localhost:8000/docs** |
| **Frontend production build** (F006) | `cd D:\resors\frontend; pnpm run build; pnpm run preview` | serves the built app on **http://localhost:4173** |

All three can run at once (open three terminals). Stop each with `Ctrl+C`. If a port is busy, Vite auto-increments
and prints the real URL; uvicorn fails with a clear error.

**Database control** (F008):

| What | Command | Note |
|---|---|---|
| Stop, keep data | `cd D:\resors; docker compose down` | volume `resors_postgres_data` persists |
| Wipe and start clean | `cd D:\resors; docker compose down -v; docker compose up -d --wait` | **deletes all local data** |
| Logs | `cd D:\resors; docker compose logs -f postgres` | `Ctrl+C` to stop following |
| Open a SQL shell | `docker exec -it resors-postgres psql -U app -d app_dev` | password is in `.env` |

> **Port clash warning:** your other projects also want 5432 — `resourcelense-postgres-1` and `qtc360-db`
> (both currently stopped) publish `5432`. Only one can run at a time. Change `POSTGRES_PORT` in `.env` to run
> them side by side. Do not delete containers belonging to other projects.

### Check the work

| What | Command | Expected |
|---|---|---|
| Frontend types (F006) | `cd D:\resors\frontend; pnpm run typecheck` | exit 0, no output |
| Frontend build (F006) | `cd D:\resors\frontend; pnpm run build` | exit 0, writes `frontend/dist/` |
| **Frontend tests (F011–F022)** | `cd D:\resors\frontend; pnpm run test:run` | **416 passing** across 49 files |
| Frontend tests, watch mode | `cd D:\resors\frontend; pnpm test` | re-runs on save; `q` to quit |
| **API client tests (F018)** | `cd D:\resors\frontend; pnpm exec vitest run tests/lib` | **29 passing** in 3 files (MSW; no network) |
| **Form kit tests (F019)** | `cd D:\resors\frontend; pnpm exec vitest run tests/components/form-fields.test.tsx tests/components/form-submission.test.tsx tests/components/confirm-dialog.test.tsx tests/components/unsaved-changes-guard.test.tsx` | **23 passing** in 4 files — validation, the `aria-describedby`/`aria-invalid` wiring, server 422 mapping with and without the toast opt-out, and the unsaved-changes prompt on a real data router |
| **DataTable tests (F020)** | `cd D:\resors\frontend; pnpm exec vitest run tests/components/data-table.test.tsx tests/components/search-field.test.tsx tests/components/filter-chip.test.tsx` | **23 passing** in 3 files — sorting/search/pagination over real fixtures, server-mode reporting without local slicing, facet counts that respect the other filters, the search debounce and the chip |
| **Table preferences (F021)** | `cd D:\resors\frontend; pnpm exec vitest run tests/components/data-table-preferences.test.tsx tests/lib/table-preferences.test.ts` | **20 passing** in 2 files — hiding/ordering a column survives a fresh mount, Reset clears both the columns and the stored entry, and preferences do not leak across table keys or user scopes |
| **CSV export/import (F022)** | `cd D:\resors\frontend; pnpm exec vitest run tests/lib/csv.test.ts tests/components/data-table-export.test.tsx` | **59 passing** in 2 files — the injection guard (including `-42` staying a number), quoting/parsing round-trips, filename sanitation, the BOM'd download with URL cleanup, all-errors import validation, and an export that follows the column preferences |
| **Database migrations (F023–F026)** | `cd D:\resors\backend; uv run alembic upgrade head` | runs `0001` → `0002` (identity) → `0003` (sessions) → `0004` (rate-limit buckets) on an empty database; a second run prints only the context lines (a no-op). `uv run alembic current` → **`0004 (head)`** — F027 added no revision; `uv run alembic downgrade base` takes the chain all the way down and leaves `alembic_version` empty; `uv run alembic history` shows the four revisions |
| **Backend tests (F023–F027)** | `cd D:\resors\backend; uv run pytest` | **103 passed** — 5 schema conventions (no database needed) + 22 password/policy/generator + 12 rate-limit (5 pure window-math + 6 DB + 1 concurrency over real connections) + 18 RBAC constraints + 18 session + 11 seed + 17 bootstrap tests, all against a dedicated `app_test` database (created and migrated by the fixtures on first run; the development database is never touched) |
| **Session model tests (F025)** | `cd D:\resors\backend; uv run pytest tests/test_session_model.py tests/test_session_tokens.py` | **18 passed** — the token-hash shape and uniqueness, both deadlines and their ordering, all-or-nothing revocation over a closed vocabulary, user FK + cascade, the unique replacement chain and `SET NULL`, the family-revocation rehearsal, the `is_active` matrix, and the token/lifetime contract |
| **Password & rate-limit tests (F026)** | `cd D:\resors\backend; uv run pytest tests/test_password_hashing.py tests/test_rate_limit.py` | **34 passed** — Argon2id parameters and the no-plaintext contract (hash content, the `User` repr, message echo), every policy rule and the confirmed defaults, the generated-password properties (F027), window alignment/`Retry-After` math, the DB counter (limit, rollover, per-key budgets, `peek` without counting, `clear`), and the twelve-connection concurrency race |
| **Seed & bootstrap tests (F027)** | `cd D:\resors\backend; uv run pytest tests/test_seed.py tests/test_bootstrap_admin.py` | **28 passed** — the vocabulary's shape and descriptions, the three roles and exactly their documented grant sets, idempotent re-runs, operator edits and non-system roles surviving, the super-admin invariant being *restored* (including codes registered later), and every bootstrap refusal path — proven with a session factory that raises if it is reached, so "refused before the database" is structural |
| **Seed the roles and permissions (F027)** | `cd D:\resors\backend; uv run python -m app.seed` | first run prints `permissions created: 17`, `roles created: 3`, `grants added: 41`; a second run prints `Seed: nothing to do — roles and permissions are up to date.` (already done for `app_dev` — this is the fresh-database command, and it is safe at any time) |
| **Create the super-admin (F027)** | `cd D:\resors\backend; uv run python -m app.bootstrap_admin --generate-password` | prompts for the email (`--email` or `BOOTSTRAP_ADMIN_EMAIL` skip the prompt), prints the generated password **exactly once** — record it in `LOCAL_CREDENTIALS.md` at that moment — and creates the account with a forced first-login change. With no password source: `There is no default password.` / `Nothing was created.`, exit 2. A second run refuses: `A super-admin already exists (…)` |
| Backend lint and types (F023) | `cd D:\resors\backend; uv run ruff check .; uv run ruff format --check .; uv run mypy app migrations` | clean. The CI gate that *enforces* this is F056's; these commands work today |
| **Renders, not just compiles (F018 fix)** | with the dev server running: `& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --user-data-dir=$env:TEMP\chrome-smoke --virtual-time-budget=9000 --enable-logging=stderr --dump-dom http://localhost:5173/` | the DOM contains the sidebar + `Dashboard` page (add `2>&1 | Select-String "CONSOLE"` to see console output). An empty `<div id="root">` or a `CONSOLE` line naming a module means the app did not start — this is the check that catches circular-import crashes, which typecheck/tests/build all miss |
| **Regenerate the API types (F018)** | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | `wrote …\backend\openapi.json`, then `✓ …\generated\api · 2 files`; **both committed artefacts must come back unchanged** — `git -C D:\resors status --short backend/openapi.json frontend/src/lib/generated` prints nothing. That is exactly F061's drift check |
| **Normalise generated UI (F014)** | `cd D:\resors\frontend; pnpm run fix:ui` | restores reverted components, remaps `cn`, strips `"use client"`, removes reinstated dependencies (run after every `shadcn add`) |
| Frontend coverage | `cd D:\resors\frontend; pnpm run coverage` | prints the v8 report — **416 tests passing**, ~89% statements overall. The threshold gate is F055/F061's; corrected in F015 because the old "100%" claim overstated what this run prints |
| API liveness (F007) | `curl http://localhost:8000/api/v1/health` | `{"status":"ok","name":"Application Platform",...}` |
| **Layout shell (F015)** | open the app, then narrow the window (or use devtools device mode) through **1440px → 900px → 390px** | 1440: 260px sidebar + 64px header. 900: the sidebar starts as the 64px icon rail. 390: no pinned sidebar; a hamburger opens the 260px drawer (Escape closes it) |
| **Sidebar preference (F015)** | click the round chevron on the sidebar edge, then press **F5** | it stays collapsed after reload; console: `localStorage.getItem('app.sidebar')` → `"collapsed"` |
| **Nav behaviour (F015)** | inside the collapsed rail, hover the **Dashboard** row; click the **Overview** group label | the label appears as a tooltip in the rail; the group collapses/expands and the choice survives **F5** (`app.sidebar.groups`) |
| **Context slot is off (F015)** | look at the header on desktop | **no** context selector is rendered — the slot is disabled by default (BIG-PROMPT §3.2a); it appears only when a module injects an enabled adapter |
| **Command palette (F016)** | press **Ctrl+K** (or Cmd+K), or click the **Search anything** box in the header | the palette opens listing `Overview → Dashboard`; typing filters; **Enter** jumps to the highlighted page; **Escape** closes and focus returns to where it was |
| **Route states (F017)** | visit **`/`**, **`/admin`**, **`/nonexistent`**, **`/403`**, **`/404`** in turn | `/` lands on `/dashboard` — the protected placeholder, which says plainly that the real screen is F047; `/admin` shows the **403** page (no admin route is registered yet, so there is nothing to redirect to); any unknown path shows **404 inside the shell** (navigation still usable); `/403` and `/404` render those pages directly |
| **Nav filtering (F016)** | compare the sidebar with the palette, and inspect the registry in `docs/ROUTES_NAVIGATION.md` §2 | both list exactly the registered pages — today only **Dashboard**. The Administration group is **absent, not empty**: its pages arrive in F034–F044, and an anonymous caller (no session until F032) may see none of them |
| **Typed client, end to end (F018)** | with the backend running, open http://localhost:5173 and paste into the devtools console: `const { api } = await import('/src/lib/api.ts'); await api.get('/api/v1/health')` | the health JSON straight from FastAPI (`{"status":"ok","name":"Application Platform",…}`) — the SPA reached the API through the Vite proxy with the generated types. Then `await api.get('/api/v1/nope').catch(e => e.detail)` → **`The requested item was not found.`** — the normalised `ApiError`, not an Axios error. The app itself makes **no** API calls on load yet: no page fabricates data, and F047's dashboard is the first real consumer |
| **Theme persists (F010)** | open the app, click the **sun/moon button in the header**, choose **Light / Dark / System**, then press **F5** | the chosen theme is still applied after reload, with **no flash** of the other theme first |
| Inspect the stored theme (F010) | browser console: `localStorage.getItem('app.theme')` | `"light"`, `"dark"` or `"system"` |
| Force a theme by hand (F009) | browser console: `document.documentElement.classList.add('dark')` / `.remove('dark')` | page repaints; a dark scrollbar on a light page would mean the token theme is broken |
| Dependencies current | `cd D:\resors\frontend; pnpm install` · `cd D:\resors\backend; uv sync` | pnpm: "Already up to date" · uv: "Audited 64 packages" |

### Repository

| What | Command | Expected |
|---|---|---|
| History | `git -C D:\resors log --oneline` | one commit per completed task |
| Working tree | `git -C D:\resors status --short` | empty |
| Line endings | `git -C D:\resors ls-files --eol` | every file `i/lf  w/lf` |
| Review a task | `git -C D:\resors show --stat <sha>` | that task's files only |

### Not available yet

| Suite | Arrives with |
|---|---|
| Frontend lint / format | F055 |
| Backend lint / types as a CI gate (Ruff, mypy) | F056 — the commands themselves work today, see above |
| Backend integration suite as a **CI gate** (the fixtures themselves are live — see the backend-tests row) | F056 |
| End-to-end (Playwright) | F057 |
| Accessibility (axe) | F058 |
| Production Docker Compose | F059 |

Nothing in this table works yet — do not run it. Each row moves up into the sections above as its task lands.

## 9. Accounts and credentials

The first account arrives when **you** run the F027 bootstrap CLI (§8) — there is no default account; later
accounts are created in the admin UI (F033). Fill the email into the row below when you bootstrap.

| Account | Email | Role(s) | Created by | Purpose |
|---|---|---|---|---|
| Super-admin (bootstrap) | _your choice — `--email`, `BOOTSTRAP_ADMIN_EMAIL`, or the CLI prompt_ | `super_admin` (+ `is_superuser`) | F027 CLI: `uv run python -m app.bootstrap_admin` | The one-time first account; must change its password at first login |

**Passwords are never written here** — this file is committed. The values live in the git-ignored
`D:\resors\LOCAL_CREDENTIALS.md`, which also explains how each account is created. Local database credentials
live in `.env` (also git-ignored).
