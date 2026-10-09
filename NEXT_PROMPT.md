# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the **single cold-start handoff**; `claude_code_pack/STATE.md` is now just a pointer to it.
> Last updated: 2026-10-10 — after task F031.

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
docs/ARCHITECTURE.md, docs/STACK_VERSIONS.md, NEXT_PROMPT.md and task F032 in
claude_code_pack/TASKS.md. Implement F032 only. Follow the one-task protocol.
Commit the task at the end. Update NEXT_PROMPT.md, then stop and give me the
operator checks — I run the suites myself.
```

Replace `F032` with the next ID from §3 when it changes. Read only the spec sections the task needs, and never
re-read the whole requirements text — it sits **in-repo** at `claude_code_pack/BIG-PROMPT.txt` (§2); jump to a
section using the index in `docs/REQUIREMENT_TRACEABILITY.md` §1–§11.

## 2. Where things are

| What | Path |
|---|---|
| Project root (repo) | `D:\resors` |
| Instruction pack | `claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `BIG-PROMPT.txt` (the verbatim requirements text), `OPERATOR_GUIDE.md` (operator runbook incl. the test-command table), `STATE.md` (pointer only) |
| Task artifacts | `docs\` — `REPOSITORY_AUDIT.md` (F001), `REQUIREMENT_TRACEABILITY.md` (F002), `STACK_VERSIONS.md` (F003), `ARCHITECTURE.md` + `REFERENCE_PARITY.md` (F004), `ROUTES_NAVIGATION.md` (F016), `OPENAPI_CLIENT.md` (F018) |
| Frontend (F006) | `frontend\` — `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `openapi-ts.config.ts`, `index.html`, `src\{main.tsx,vite-env.d.ts,app\{router,providers\}.tsx,lib\{api,errors,query-keys\}.ts,lib\generated\api\}` |
| Backend (F007) | `backend\` — `pyproject.toml`, `uv.lock`, `.python-version`, `openapi.json` (generated, committed), `scripts\export_openapi.py`, `alembic.ini`, `migrations\versions\`, and `app\` (`main.py`, `seed.py`, `bootstrap_admin.py`, `core\`, `models\`, `api\v1\`, `tests\`) |
| **Requirements text** | `claude_code_pack\BIG-PROMPT.txt` — the **verbatim** requirements document, source of every `BP-x.y` citation, **inside the project** since 2026-10-10. Read it here; **never edit it** — it is kept byte-identical to the archive original, so its recorded SHA-256 stays verifiable |
| Reference source (**outside the project folder**) | `D:\QTC360\qtc360\` — the **entire source tree, extracted** (backend, frontend, compose files, docs). This is the copy to read — e.g. production Docker hints come from its `docker-compose.prod.yml` |
| Reference archive (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip` (original archive, audit record) and `D:\RESORS_REFERENCE\BIG-PROMPT.txt` (the archive original of the requirements text — kept for the audit record only, now that the pack holds the working copy) |
| Unrelated — do not touch | the rest of `D:\QTC360\` outside `qtc360\` (separate QTC360 working areas: logo/design assets, `Workshop\`, `QAQC Documents\`) |

The **requirements text needs no out-of-folder trip any more**: the pack copy is the one to read (`.gitignore`
re-includes exactly that path out of the reference safety net, and `.gitattributes` pins it `-text` so its
bytes — CRLF included — never change). It **outranks the reference source** when they disagree (e.g.
`BIG-PROMPT` §0.2 forbids its branding). The **source tree** is still outside the repo by design: read it by
absolute path (an out-of-folder read may raise a permission prompt, which is expected), and it is **read-only
and untrusted** — never run anything from it, never copy its branding, `db_dump` credentials, seed data, fonts
or domain (construction) code into this repo; hints and patterns only. Hashes (the in-repo copy must match
the archive original — `sha256sum` both to check):
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed: **F031 — Permission guards** (`app/core/permissions.py::effective_permissions` — the
  union across roles, folded per request, with **`is_superuser` expanding to every code at runtime**
  (break-glass, never persisted as grants; the seeded `super_admin` role stays the visible dictionary);
  `app/api/v1/dependencies.py` now layers `optional_session` → `authenticated_session` (raw: 401) →
  **`current_session` (the default: 401, or 403 while `must_change_password` is set)** →
  `require_permission(code)` (a `PermissionCode` member + the union check, one generic 403); the
  forced-change exemption list is exactly the auth router — logout, logout-all, change-password,
  `/auth/me`; **`GET /auth/me`** serves identity + sorted role names + the expanded sorted union;
  BP-6.3c's `require_admin` deliberately not built (specific codes are the boundary); DECISIONS C20;
  9 new tests, 161 total; no migration; `openapi.json` + frontend types regenerated).
- **Next task: F032 — Auth frontend.** "Login guard, session-renewal handling, forced-change and logout
  flows." Accept: "Browser auth flow test". Everything it needs is live: the full backend auth surface
  (login, logout, logout-all, change-password, `/auth/me`), the cookie + CSRF contract (`__Host-session`
  HttpOnly; readable `__Host-csrf` copied into **`X-CSRF-Token` on every unsafe request**), the status
  semantics to branch on — **401** = no/expired session (clear state, go to login), **403 + detail "Your
  password must be changed before continuing."** = forced-change backstop, **403 generic** = insufficient
  permission (403 UI), **422 field arrays** = map onto forms via `fieldErrors`, **429** = retry-after
  message — and `/auth/me`'s `must_change_password` + `permissions` for routing and UI affordances
  (the frontend's registry mirrors the codes; it is never the boundary). `lib/api.ts` already sends
  cookies same-origin (Vite proxy) and normalises errors; F032 adds the auth guard, the forced-change
  route, the 401 handling (BIG-PROMPT §6.2e: redirect only after anonymous/expired resolution; network
  failure gets Retry UI, not a logout), logout/logout-all calls, and identity-scoped cache resets.
- Git: branch `main`, one commit per completed task; the tree is clean after each commit. F031 sits on top of
  `b8b12f9` (F030).
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
- **Authorization is live (F031):** `app/core/permissions.py::effective_permissions(user)` — the one
  definition of the union: the codes across the user's roles, folded per request from the graph F029's
  resolution loads (no cache; a role change applies on the next request). **`is_superuser` is
  break-glass**: expands to `ALL_PERMISSION_CODES` at runtime, never persisted as grants (deployment
  order must not lock the un-lockable account out of a new code); the seeded `super_admin` role stays the
  visible dictionary (F036's protected column). The dependencies (`app/api/v1/dependencies.py`) now
  layer — and the *defaulting* is the security: **`current_session` is the one to reach for** (401, or
  **403 "Your password must be changed before continuing."** while the forced-change flag is set), with
  `authenticated_session` (raw 401) reserved for the auth router's deliberate exemption list (logout,
  logout-all, change-password, `/auth/me` — the SPA reads the flag there to route), and
  `require_permission(PermissionCode.X)` (a member, not a string — a typo is an import error) layering
  `current_session` + the union check with one generic 403. **`GET /api/v1/auth/me`** serves identity +
  sorted role names + the **expanded** sorted union — no `is_superuser` (redundant once expanded, the
  frontend checks set membership), no `is_active` (a disabled account's session never resolves) —
  reachable during a forced change; `PATCH /auth/me` + preferences are F041's. BP-6.3c's `require_admin`
  deliberately not built (specific codes are the boundary; super-admin *business rules* are F033/F035's).
  No migration; `openapi.json` + generated frontend types refreshed. **Tests:** 9 new, `uv run pytest`
  is now **161 passed**.
- **The password lifecycle is live (F030):** `POST /api/v1/auth/change-password`
  (`app/api/v1/auth.py` → NEW `app/services/passwords.py`) — one endpoint for the forced first-login change
  and Profile > Security, requiring the current password (BIG-PROMPT §6.1) and, on success, committing
  **one unit of work**: hash under current Argon2 parameters, every *other* session revoked
  (`password_change`), the asking session rotated (a fresh cookie pair on the 204; absolute deadline
  inherited), `must_change_password` cleared, `password_reset_at` stamped. Refusals: 422 with
  Pydantic-shaped entries **minus `input`** — wrong current password at `body/current_password`, policy
  violations (all at once, evaluated with the user's own email) at `body/new_password`; new-equals-current
  is a violation too. A wrong current password is deliberately not a 401 (that means "session over" to the
  frontend and would sign the user out). **Re-authentication throttling:** failures count in their own
  bucket `password:account:<email>` (never login's — neither flow can lock the other out), the gate runs
  before the Argon2 work, failures commit before raising, and a verified current password clears the bucket
  (429 + `Retry-After` when exhausted). **Admin reset** lives as `reset_password` in the same module — a
  policy-passing temporary from `generate_password`, forced change, **every** session of the target revoked
  (`admin`), temporary returned for shown-once delivery; its HTTP endpoint
  (`POST /api/v1/admin/users/{id}/reset-password`) is deliberately **F033's** (it needs F031's
  `users.reset_password` guard). `services/sessions.py` grew two non-committing building blocks —
  `rotate_within` and `revoke_user_sessions` (`rotate_session`/`log_out_all` are now thin committing
  wrappers, behaviour unchanged) — and `core/rate_limit.py` gained `password_key`. No migration;
  `openapi.json` + generated frontend types refreshed. **Tests:** 14 new — 152 at that commit, 161 after
  F031's 9.
- **Sessions resolve and end (F029):** `app/services/sessions.py` — `resolve_session` (row by digest →
  replay check → expiry → user check → **idle slide capped at the absolute deadline, committed by the
  resolver itself**), `rotate_session` (successor in the same family, **absolute deadline inherited**,
  predecessor `rotated` + `replaced_by_id`), `revoke_family` (`theft_detected`), `log_out`, `log_out_all`.
  `app/api/v1/dependencies.py` — `optional_session` / `current_session` (401 one message), **the dependency
  F030/F031 build on**. Endpoints: `POST /auth/logout` (always 204, both cookies cleared, full resolution so
  a replayed ID still kills the family) and `POST /auth/logout-all` (401 without a live session; revokes
  every live row as `logout_all`). **CSRF is enforced globally now** — `app/core/csrf.py`, an ASGI middleware
  wrapping every route: on unsafe methods a claimed `Origin`/`Referer` must reduce to a trusted origin
  (**new setting `ALLOWED_ORIGINS`, default `http://localhost:5173`** — the browser's origin is the Vite
  dev server's), and any request carrying `__Host-session` must send `X-CSRF-Token` equal to the
  `__Host-csrf` cookie; **`/auth/login` is exempt from the double-submit only**. Cookie spellings now live
  once in `app/core/cookies.py`. No migration; `openapi.json` + generated frontend types refreshed.
  **Tests:** 24 new (13 session-lifecycle + 11 CSRF) — 138 at that commit, 152 after F030's 14.
- **Login is live (F028):** `POST /api/v1/auth/login` (`app/api/v1/auth.py` → `app/services/auth.py`) — the
  first endpoint with a database dependency (the request-scoped rule is in `app/core/database.py`: the
  service commits; the failure path commits its rate-limit counters *before* raising). One **uniform 401**
  for every credential failure (unknown email, wrong password, deactivated, deleted, unusable hash) with a
  decoy Argon2 verification for unknown emails; one **uniform 429** + `Retry-After` from two buckets
  (per account, per address — counted before the lookup, whether or not the account exists; the throttle
  gates before the password check). Success clears the account bucket only; a below-policy hash is
  re-hashed on the way through. Cookies: `__Host-session` (HttpOnly, Secure, SameSite=Lax, no Max-Age —
  a browser-session cookie) and the readable `__Host-csrf` companion (enforced by F029, see above).
  Response is identity only (no roles/permissions — `/auth/me` arrives with F030/F031). Throttling uses
  `request.client.host`; `X-Forwarded-For` trust is F060's. **Tests:** 11 (114 total at that commit).
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
  **Tests:** 31 new (11 seed + 17 bootstrap + 3 generator) — `uv run pytest` went to **103 passed** at this
  commit (114 after F028's 11; 138 after F029's 24; 152 after F030's 14; 161 after F031's 9).
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
- **C17** — F028's login flow (uniform 401 with the decoy verification, uniform 429 from the two buckets,
  commit-on-failure, account-bucket reset on success, the two `__Host-` cookies, `request.client.host` as
  the throttle address with proxy-header trust deferred to F060), same date and same basis; rationale in
  ARCHITECTURE §3/§12.
- **C18** — F029's session lifecycle and CSRF (replay of a `rotated` row kills the family as
  `theft_detected` on every resolving endpoint; rotation inherits the absolute deadline; the idle slide is
  committed by the resolver; logout is always-204, logout-all requires a session; the `ALLOWED_ORIGINS`
  origin check plus `X-CSRF-Token` double-submit for session-carrying unsafe requests, login exempt from
  the double-submit only; `token_version` has no second role), same date and same basis; rationale in
  ARCHITECTURE §3/§12.
- **C19** — F030's password-change lifecycle (self-change requires the current password and is one commit:
  hash + revoke-others `password_change` + rotate + clear the flag + stamp `password_reset_at`; refusals
  are field-addressable 422s without `input`, never 401; re-auth throttled in its own
  `password:account:` bucket with a verified password clearing it; admin reset = policy-passing temporary,
  forced change, **all** sessions revoked `admin`, **no** current password — its endpoint is F033's,
  behind F031's `users.reset_password` guard), same date and same basis; rationale in ARCHITECTURE §3/§12.
- **C20** — F031's permission guards (the union via `effective_permissions`; `is_superuser` expands to
  every code at runtime as break-glass, never persisted; the dependency layering with **`current_session`
  gated by default** and the auth router as the staged exemption list; `require_permission` takes a
  `PermissionCode` member; `require_admin` deliberately not built; `/auth/me` = identity + expanded sorted
  union, reachable during a forced change), same date and same basis; rationale in ARCHITECTURE §6/§12.
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
- **Login's security properties are load-bearing for every later auth task (F028):** the failure paths must
  keep committing their rate-limit counters before raising (a rollback there silently disarms the throttle —
  the follow-on test `hit_count == 5` is what catches it), the 401/429 bodies must stay uniform across causes,
  and no later endpoint may weaken the timing equalisation (the decoy verification's parameters are pinned by
  `test_the_decoy_hash_is_current_parameter`).
- **CSRF is enforced globally, and the rules are load-bearing (F029, C18):** the middleware
  (`app/core/csrf.py`) wraps every route, so a new unsafe endpoint is covered automatically — **but the
  frontend (F032) must send `X-CSRF-Token` (from the readable `__Host-csrf` cookie) on every unsafe
  request**, and any curl/smoke command against an authenticated unsafe endpoint needs both that header and
  a trusted `Origin`. Do not exempt a path from the double-submit except the one stated rule (login
  establishes a session rather than riding one); do not weaken the origin check to "absent origin passes
  only if…" — absent-origin-passes is the design, and the double-submit is the binding check for
  cookie-carrying requests. Set `ALLOWED_ORIGINS` for any deployment (F060 validates it).
- **The session rules are equally load-bearing (F029, C18):** rotation must inherit the **absolute**
  deadline (extending it on rotation is exactly the bug the column pair exists to prevent), the resolver's
  idle-slide commit must stay independent of the handler (a 404 still moved the clock), and replay
  detection must run before the expiry check and on *every* resolving path — logout included. The family
  revocation is a bulk UPDATE: anything reading those rows back in the same session re-reads with
  `populate_existing=True` (ARCHITECTURE §12, F025). F030/F031 consume `current_session`/
  `optional_session` from `app/api/v1/dependencies.py` — extend those, never re-resolve the cookie
  somewhere else.
- **The password-change contracts are load-bearing too (F030, C19):** the credential update, the
  revocation of the other sessions and the rotation are **one commit** in `services/passwords.py` — do not
  "simplify" by calling the committing `rotate_session`/`log_out_all` wrappers in the middle of it; use the
  non-committing `rotate_within`/`revoke_user_sessions`. Auth refusals that concern credentials must never
  be 401 (the frontend's 401 policy means "session over") and must never echo the submitted value —
  hand-built 422s stay `loc` + `msg` (+ `type`), no `input`. The re-auth bucket key is
  `password:account:` — never `login:account:` (neither flow may lock the other out). F033 must build
  `POST /admin/users/{id}/reset-password` on `services/passwords.reset_password` behind F031's
  `users.reset_password` guard — the service deliberately does not enforce who may reset whom.
- **F031's `must_change_password` gate** (BIG-PROMPT §6.1) must let `POST /auth/change-password` (and
  login/logout) through while the flag is set — the forced-change flow needs the session it is about to
  rotate. The flag is cleared by the change itself (F030); the gate is about *regular* endpoints only.
- **Authorization defaults are load-bearing (F031, C20):** a new endpoint reaches for
  **`current_session`** (gated) — never `authenticated_session` unless it is on the auth router's
  exemption list, and never re-resolving the cookie. Privileged data goes through
  `require_permission(PermissionCode.X)`: a member of the vocabulary, not a string; adding a permission
  means adding it to `PermissionCode` + `PERMISSION_DESCRIPTIONS` + running the seed (the superuser is
  never locked out thanks to the runtime expansion). The three 403 identities are contract: generic
  permission denial, the forced-change detail, and CSRF's two details — F032 branches on them and on
  `/auth/me`, never on guesses. Do not add a `require_admin`-style shortcut: the narrowest code is the
  boundary; `is_superuser` is data for F033/F035's business rules (last-super-admin protection), not a
  dependency. Guard tests mount a **scratch FastAPI app** in the test file over the real dependencies
  and rollback session — never add placeholder routes to the real app (ARCHITECTURE §12).
- **The throttling address is `request.client.host` on purpose (F028, C17).** Do not "fix" it by reading
  `X-Forwarded-For` outside F060's validated-proxy configuration — unvalidated, that header is client-controlled
  and trusting it would hand every attacker a fresh rate-limit bucket per request.
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

- **F031 — Permission guards.** The authorization boundary, built so the *default* is the safe answer.
  `app/core/permissions.py::effective_permissions(user)` — the union across the user's roles, folded per
  request from the graph F029's resolution already loaded (a role change applies on the next request,
  BP-6.3f; no cache to invalidate). **`is_superuser` is break-glass**: it expands to every code at runtime
  (`ALL_PERMISSION_CODES`), never persisted as grants — the seed re-asserts `super_admin`'s matrix only
  when someone runs it (C16), and the account that exists to be un-lockable must not be locked out of a
  new code by deployment order; the seeded role remains the visible dictionary (F036's protected column).
  The dependencies (`app/api/v1/dependencies.py`) now layer `optional_session` (raw, `None` ok) →
  `authenticated_session` (raw, 401) → **`current_session` (the default: 401, or 403
  `PASSWORD_CHANGE_REQUIRED_DETAIL` while the forced-change flag is set — the flag check runs *before*
  any permission check)** → `require_permission(PermissionCode.X)` (a member, not a string — a typo is an
  import error; one generic 403, the endpoint body never runs). The forced-change exemption list is
  exactly the auth router — logout, logout-all, change-password (it *is* the change) and `/auth/me` (the
  SPA reads the flag there to route) — and every regular endpoint, present and future, picks up the gate
  by choosing the natural-looking dependency. **`GET /api/v1/auth/me`**: identity + sorted role names +
  the **expanded** sorted union (superusers see every code's name, never a wildcard — the frontend checks
  set membership); no `is_superuser`/`is_active` (redundant and never-false respectively). BP-6.3c's
  `require_admin` is deliberately **not** built: specific codes are the boundary; the super-admin
  business rules (last-super-admin protection, escalation prevention) are F033/F035's, over `is_superuser`
  as data (C20). Cheaper checks were dishonestly considered and rejected: a permission cache (staleness
  vs one folded set of loaded rows) and a hardcoded guard list (drifts from the vocabulary). Checks run:
  `uv run pytest` **161 passed** (9 new, incl. the union via two roles, dedupe, the superuser expansion,
  same-cookie re-evaluation after `expunge_all`, fail-closed 401s, and the forced-change gate lifting
  when the real change-password flow completes); `ruff check`/`format --check` clean; `mypy app
  migrations` clean (33 files); **no migration** (`0004` remains head); `openapi.json` + generated
  frontend types regenerated and committed. ARCHITECTURE §12 gained the scratch-app test pattern and the
  three asyncio-ORM traps it flushed out (`no_autoflush` while building pending graphs, `expunge_all`
  not `expire_all` to simulate a fresh request, ids captured before expunging).
- **F030 — Password change lifecycle.** `POST /api/v1/auth/change-password` (`app/api/v1/auth.py` →
  `app/services/passwords.py`) — one endpoint for the forced first-login change and Profile > Security,
  because they are one act; the acceptance "old sessions invalid" is the design: **success is a single
  unit of work** — the new hash (always current Argon2 parameters; a change *is* the rehash), every
  *other* session of the account revoked as `password_change`, the asking session **rotated**
  (`rotate_within` — same family, absolute deadline inherited), `must_change_password` cleared,
  `password_reset_at` stamped — where splitting the commit would leave a successor session that outlived
  the password it was minted under. The current password is required even during the forced change
  (BIG-PROMPT §6.1: "password changes require current password except privileged reset"). **Refusals are
  field-addressable 422s** and never 401 — a typo must not trip the frontend's "session over" policy:
  wrong current password at `loc=body/current_password`, every policy violation at once at
  `loc=body/new_password` (the policy runs in the *service* because the denylist's email rule needs the
  stored address), new-equals-current as `SAME_AS_CURRENT_VIOLATION`, and the entries deliberately omit
  Pydantic's `input` — a credential must not be echoed (the frontend reads `loc`/`msg` only;
  ARCHITECTURE §12 records the why). **The current-password verification is throttled in its own bucket**
  (`password:account:<email>`, new `password_key` in `core/rate_limit.py` — never login's, so neither
  flow can lock the other out): the gate runs before the Argon2 work, failures commit before raising
  (F028's lesson, with the `hit_count == 6` follow-on test), and a *verified* current password clears the
  bucket, persisting even through a policy refusal. **Admin reset** is the `reset_password` service:
  a policy-passing temporary from F026's `generate_password` (C15's uniform path, tested), forced change,
  **every** session of the target revoked as `admin`, the temporary returned for shown-once delivery; no
  current password is asked (privileged reset) and *who may reset whom* is deliberately not the service's
  policy — the HTTP endpoint (`POST /api/v1/admin/users/{id}/reset-password`) is F033's, behind F031's
  `users.reset_password` guard (recorded in C19 so it is not lost). `services/sessions.py` gained the two
  non-committing building blocks (`rotate_within`, `revoke_user_sessions`) with `rotate_session`/
  `log_out_all` as thin committing wrappers — F029's behaviour and tests unchanged. Checks run:
  `uv run pytest` **152 passed** (14 new); `ruff check`/`format --check` clean; `mypy app migrations`
  clean (33 files); **no migration** (`0004` remains head); `openapi.json` + generated frontend types
  regenerated and committed; one trap avoided en route: Starlette deprecates
  `HTTP_422_UNPROCESSABLE_ENTITY` — the endpoint uses `HTTP_422_UNPROCESSABLE_CONTENT`.
- **F029 — Session rotation and logout.** What happens to a session after F028 issues it. **Resolution**
  (`app/services/sessions.py::resolve_session`, wrapped by `optional_session`/`current_session` in
  `app/api/v1/dependencies.py` — the dependency F030/F031 build on): row by digest, then **replay first** —
  a row revoked as `rotated` being presented again means the rotation's predecessor outlived its rotation;
  every live family member dies as `theft_detected` in one UPDATE and the presented row keeps its `rotated`
  record — then expiry/logout as quiet refusals (no write), then the user check (a deactivated user's live
  row is refused but left for F033 to revoke with a real reason), then **the idle slide** to
  `min(now + idle, absolute)`, **committed by the resolver itself** because the clock moved whatever the
  handler does next (the bookkeeping rule: handler work commits in the service it calls; bookkeeping
  commits where it is written — ARCHITECTURE §12). **Rotation** (`rotate_session`): successor in the same
  family, predecessor `rotated` + `replaced_by_id` in one commit, successor **inherits the absolute
  deadline** (rotation must never extend a sign-in) while idle restarts; callers are events (F030 password
  change, F035 role change), never a refresh endpoint (C12). **Logout** (`POST /auth/logout`): always 204,
  both cookies cleared, idempotent — full resolution runs, so replaying a rotated ID *through logout* still
  kills the family (tested). **Logout-all** (`POST /auth/logout-all`): 401 without a live session, one bulk
  UPDATE of every live row of the user (`logout_all`), cookies cleared. **CSRF** (`app/core/csrf.py`, an
  ASGI middleware wrapping every route — impossible for a future endpoint to forget): on unsafe methods a
  claimed `Origin` (else `Referer`) must reduce *exactly* to an origin in the new `ALLOWED_ORIGINS` setting
  (default the dev Vite origin — the browser's origin is the frontend's, not the API's; `Origin: null`
  refused; absent origin passes, because that is a scripted client and the double-submit binds
  cookie-carrying requests), and any request carrying `__Host-session` must send `X-CSRF-Token` equal to the
  `__Host-csrf` cookie (constant-time on bytes — a non-ASCII hostile header earns 403, not 500; a scope-level
  test pins it). **`POST /auth/login` is exempt from the double-submit only** — it establishes a session
  rather than riding one, and the dead HttpOnly cookie a browser cannot delete must not lock the login form;
  login CSRF stays covered by the origin check (tested). Cookie names/attributes/helpers consolidated into
  `app/core/cookies.py`; `token_version` decided (C18): **no second role** — the row is the revocation unit.
  Checks run: `uv run pytest` **138 passed** (24 new: 13 session-lifecycle incl. the F025 rehearsal fired
  for real, 11 CSRF incl. the origin matrix and the login carve-out; the `make_client`/`client` fixtures
  moved to `conftest.py`; per-request cookies replaced by jar cookies — httpx deprecates the former — and
  the jar drops `Secure` cookies over `http://` anyway); `ruff check`/`format --check` clean;
  `mypy app migrations` clean (32 files); **no migration** (`0004` remains head); `openapi.json` +
  `frontend/src/lib/generated/api/*` regenerated and committed; `app_test` left empty after the suite.
- **F028 — Authentication login.** `POST /api/v1/auth/login` — the endpoint where BP-6.2g's "no user
  enumeration" becomes mechanics. **One refusal for every cause**: unknown email, wrong password,
  deactivated account, deleted account, unusable stored hash — one 401, one body (six causes, asserted
  byte-equal). **Comparable timing**: an unknown email still pays one Argon2 verification, against a decoy
  hash generated at import under the *current* parameters (`_DUMMY_PASSWORD_HASH`; a test pins that the
  decoy is not stale — a stale decoy would be the fast path it exists to close — and a spy proves the
  unknown-email path runs a real verification). **One throttle answer**: both buckets (per account, per
  address via `hit`/`account_key`/`ip_key`) are counted *before* the lookup and whether or not the account
  exists; a denied attempt is a 429 + `Retry-After` that depends only on the caller — asserted identical
  for an existing and a non-existent email — and the throttle gates before the password check, so a
  throttled caller cannot burn verification work. **Failures persist**: the service commits the counters
  *before* raising (`InvalidCredentials`/`LoginRateLimited`) — the stated exception to "a handler that
  raises commits nothing" (ARCHITECTURE §12) — with the follow-on test asserting `hit_count == 5` after
  five failures, which is what catches a regression to "commit only on success". A **successful login
  clears the account bucket but not the address bucket** (one known credential must not buy a fresh
  guessing budget for other accounts). Cookies (ARCHITECTURE §3): `__Host-session` — HttpOnly, Secure,
  SameSite=Lax, Path=/, no Domain, **no Max-Age** (a browser-session cookie; the row's deadlines are the
  authority) — plus the readable `__Host-csrf` companion that **F029** will enforce via double-submit;
  `Secure` even in dev because browsers treat `http://localhost` as a secure context and the `__Host-`
  prefix requires it. A below-policy stored hash is re-hashed on the way through (F026's no-reset-wave
  promise, kept); `token_version` untouched (F029 decides). Throttling uses `request.client.host`;
  `X-Forwarded-For` trust deferred to F060 (unvalidated it is a bypass). The response is identity only —
  no roles/permissions; the union is F031's and arrives as `/auth/me`. New: `app/api/v1/auth.py`,
  `app/services/auth.py`, `app/schemas/auth.py`; the request-scoped transaction rule is now stated in
  `app/core/database.py`. Checks run: `uv run pytest` **114 passed** (11 new — the login suite freezes the
  clock for every test, because a suite that straddles a rate-limit window boundary flakes once in a
  thousand runs); `ruff check`/`format --check` clean; `mypy app migrations` clean (28 files); **no
  migration** (`0004` remains head); `openapi.json` + `frontend/src/lib/generated/api/*` regenerated and
  committed; `app_test` left empty after the suite.
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
| **Database migrations (F023–F026)** | `cd D:\resors\backend; uv run alembic upgrade head` | runs `0001` → `0002` (identity) → `0003` (sessions) → `0004` (rate-limit buckets) on an empty database; a second run prints only the context lines (a no-op). `uv run alembic current` → **`0004 (head)`** — F027–F031 added no revision; `uv run alembic downgrade base` takes the chain all the way down and leaves `alembic_version` empty; `uv run alembic history` shows the four revisions |
| **Backend tests (F023–F031)** | `cd D:\resors\backend; uv run pytest` | **161 passed** — 5 schema conventions (no database needed) + 22 password/policy/generator + 12 rate-limit (5 pure window-math + 6 DB + 1 concurrency over real connections) + 18 RBAC constraints + 18 session + 11 seed + 17 bootstrap + 11 login + 13 session-lifecycle + 11 CSRF + 14 password-lifecycle + 9 authorization tests, all against a dedicated `app_test` database (created and migrated by the fixtures on first run; the development database is never touched) |
| **Login tests (F028)** | `cd D:\resors\backend; uv run pytest tests/test_auth_login.py` | **11 passed** — six credential-failure causes answered with the *same* 401 body, the unknown-email path proven to run a real Argon2 verification against the decoy (whose parameters are pinned current), both throttle buckets (per account and per address) incl. the identical 429 for a non-existent email, `hit_count == 5` persisted after five failures (commit-on-failure), the account-bucket reset on success, rehash-on-login, the exact cookie attributes, and 422 for malformed bodies |
| **Session lifecycle tests (F029)** | `cd D:\resors\backend; uv run pytest tests/test_auth_sessions.py` | **13 passed** — resolution returns the user, the idle slide (committed by the resolver, capped at the absolute deadline, which never moves), expiry refused without a write, disabled users refused and left for the admin flow, rotation (same family, `rotated` + `replaced_by_id`, absolute deadline inherited), the replay killing exactly its own family as `theft_detected` while the presented row keeps `rotated`, logout (204, both cookies cleared, revoked `logout`, idempotent for junk/already-ended cookies), logout-all (401 without a session; every live row of *one* user revoked `logout_all`, others untouched), and a replay through logout still killing the family |
| **CSRF tests (F029)** | `cd D:\resors\backend; uv run pytest tests/test_csrf_protection.py` | **11 passed** — the double-submit enforced whenever the session cookie is present (four refusal shapes, each changing nothing) and passing with no origin for scripted clients, the origin matrix refused even with a perfect double-submit (`https://evil.example`, `null`, scheme mismatch, lookalike host), the `Referer` fallback (and Origin winning when both are present), safe methods never checked, a latin-1 hostile header earning 403 not 500, login refusing a cross-site origin, and the carve-out: a dead session cookie does not lock the login form |
| **Password-lifecycle tests (F030)** | `cd D:\resors\backend; uv run pytest tests/test_password_change.py` | **14 passed** — wrong current password refused with nothing changed; policy evaluated with the user's own email and never echoing the candidate; new-equals-current refused; the core: rotation of the asking session (absolute deadline inherited) + every other session `password_change` + hash/flags/reset-stamp in one commit; the forced-change flag cleared; the throttle (6th attempt denied before verification, `hit_count == 6` persisted, a verified password forgiving the failures *through* a policy refusal); the reset end-to-end (policy-passing temporary, all sessions `admin`, bystander untouched, temporary signs in with the flag surfaced); and over HTTP: 204 with a fresh cookie pair, the sibling session dead, 401 without a session, 403 without the CSRF header, the wrong-current-password **422 field error (not 401) with the session still alive**, multiple policy entries on `new_password`, and the 429 with `Retry-After: 900` |
| **Authorization tests (F031)** | `cd D:\resors\backend; uv run pytest tests/test_authorization.py` | **9 passed** — `/auth/me` returns identity + sorted roles + the deduped sorted union, and stays reachable during a forced change; the superuser expansion lists every code by name with no roles; access granted by *either* of two roles against a scratch app, denied with the generic 403 (and the guarded body never runs); re-evaluation proven with `expunge_all` — the same cookie gets 403 after a DB-level revoke and 200 after re-granting, no re-login; no session → 401 everywhere; a deactivated user → 401 everywhere; and the forced-change gate: 403 with the flag detail (before the permission check), nothing executed, then the real change-password flow lifts it on the very next request |
| **Session model tests (F025)** | `cd D:\resors\backend; uv run pytest tests/test_session_model.py tests/test_session_tokens.py` | **18 passed** — the token-hash shape and uniqueness, both deadlines and their ordering, all-or-nothing revocation over a closed vocabulary, user FK + cascade, the unique replacement chain and `SET NULL`, the family-revocation rehearsal, the `is_active` matrix, and the token/lifetime contract |
| **Password & rate-limit tests (F026)** | `cd D:\resors\backend; uv run pytest tests/test_password_hashing.py tests/test_rate_limit.py` | **34 passed** — Argon2id parameters and the no-plaintext contract (hash content, the `User` repr, message echo), every policy rule and the confirmed defaults, the generated-password properties (F027), window alignment/`Retry-After` math, the DB counter (limit, rollover, per-key budgets, `peek` without counting, `clear`), and the twelve-connection concurrency race |
| **Seed & bootstrap tests (F027)** | `cd D:\resors\backend; uv run pytest tests/test_seed.py tests/test_bootstrap_admin.py` | **28 passed** — the vocabulary's shape and descriptions, the three roles and exactly their documented grant sets, idempotent re-runs, operator edits and non-system roles surviving, the super-admin invariant being *restored* (including codes registered later), and every bootstrap refusal path — proven with a session factory that raises if it is reached, so "refused before the database" is structural |
| **Seed the roles and permissions (F027)** | `cd D:\resors\backend; uv run python -m app.seed` | first run prints `permissions created: 17`, `roles created: 3`, `grants added: 41`; a second run prints `Seed: nothing to do — roles and permissions are up to date.` (already done for `app_dev` — this is the fresh-database command, and it is safe at any time) |
| **Create the super-admin (F027)** | `cd D:\resors\backend; uv run python -m app.bootstrap_admin --generate-password` | prompts for the email (`--email` or `BOOTSTRAP_ADMIN_EMAIL` skip the prompt), prints the generated password **exactly once** — record it in `LOCAL_CREDENTIALS.md` at that moment — and creates the account with a forced first-login change. With no password source: `There is no default password.` / `Nothing was created.`, exit 2. A second run refuses: `A super-admin already exists (…)` |
| **Login smoke (F028)** | with the API running: `curl.exe -i -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"you@example.com","password":"wrong-guess"}'` | **401** + `{"detail":"Invalid email or password."}` — and the *identical* body for an email that does not exist (that is the point). With the real password (from `LOCAL_CREDENTIALS.md`): **200**, the user JSON (identity only), and two `Set-Cookie` headers — `__Host-session` (HttpOnly) and `__Host-csrf`. Every failed attempt counts: five in 15 minutes, then the next is **429** + `Retry-After` (`Too many login attempts. Try again later.`). So run the *correct* pair first if you plan to fumble; or use http://localhost:8000/docs → `POST /auth/login` → *Try it out* (the browser then keeps the cookies for `/docs` calls) |
| **Session & CSRF smoke (F029)** | step 1, with the API running and the real password: `curl.exe -s -c $env:TEMP\resors-cookies.txt -o NUL -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"you@example.com","password":"<real password>"}'`; step 2, read the CSRF value: `Select-String __Host-csrf $env:TEMP\resors-cookies.txt` (last column); step 3, **`<csrf>` = that value**: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X POST http://localhost:8000/api/v1/auth/logout -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>"` | step 3: **204**, two `Set-Cookie` lines emptying `__Host-session` and `__Host-csrf`; run step 3 again → **204** again (logout is idempotent). Without `X-CSRF-Token` → **403** `CSRF token missing or invalid.`; with `Origin: https://evil.example` → **403** `This origin is not allowed to make this request.`; `POST /api/v1/auth/logout-all` with no cookie → **401** `Not authenticated.` (curl's jar resends the Secure cookies to localhost — verified). A **rotated** cookie being presented anywhere (after F030 rotates) answers 401 *and* kills that session family as `theft_detected` — the test suite is the place to watch that, not curl |
| **`/auth/me` smoke (F031)** | with the jar from the F029 row freshly logged in: `curl.exe -s -b $env:TEMP\resors-cookies.txt http://localhost:8000/api/v1/auth/me` | **200** with identity (`id`, `email`, `full_name`, `phone`, `must_change_password`), `roles` — for the bootstrap account `["super_admin"]` — and **`permissions`**: the bootstrap account is `is_superuser`, so the list is **all 17 codes** sorted (`audit.read` … `users.update`) — the runtime expansion, no wildcard. Without the cookie: **401** `{"detail":"Not authenticated."}`. Sign in as a role-limited account (create one with F033 when it lands) and the list becomes exactly that role's union |
| **Password-change smoke (F030)** — the *safe* path: no state change | with the jar from the F029 row freshly logged in (steps 1–2), **`<csrf>` = the jar's `__Host-csrf`**: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X POST http://localhost:8000/api/v1/auth/change-password -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>" -d '{"current_password":"definitely-wrong","new_password":"a brand new passphrase"}'` | **422** with `detail: [{"type":"value_error","loc":["body","current_password"],"msg":"Current password is incorrect."}]` — field-addressable, no `input`, and the session survives (the next command still works). Drop `X-CSRF-Token` → **403**; a `new_password` of `password123` (with the *correct* current one — this one does verify) → **422** with two entries on `new_password` (too short + common list) and nothing changed. Five wrong current passwords → the sixth is **429** + `Retry-After`. A **real** change (correct current + policy-passing new) answers **204** + a fresh cookie pair and invalidates every other session — if you smoke that, pick the new password deliberately and immediately update `LOCAL_CREDENTIALS.md`, because login will demand it from then on |
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
