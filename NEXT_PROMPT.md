# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the **single cold-start handoff**; `claude_code_pack/STATE.md` is now just a pointer to it.
> Last updated: 2026-10-10 — after task F041.

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
docs/ARCHITECTURE.md, docs/STACK_VERSIONS.md, NEXT_PROMPT.md and task F042 in
claude_code_pack/TASKS.md. Implement F042 only. Follow the one-task protocol.
Commit the task at the end. Update NEXT_PROMPT.md, then stop and give me the
operator checks — I run the suites myself.
```

Replace `F042` with the next ID from §3 when it changes. Read only the spec sections the task needs, and never
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
- Last completed: **F041 — Profile API** (`PATCH /auth/me` (full name + phone, `extra="forbid"` so an
  email attempt is a 422, not a silent no-op; response = the same `MeResponse` the GET serves) and the
  preferences API (`user_preferences`, **migration `0006`**: JSONB under a unique `(user_id, key)`,
  free-form vocabulary by design — C30 contrasts it with settings' registry — with the key pattern
  enforced at API and CHECK, an 8 KiB serialized value cap, null refused (deleting IS the nulling),
  `GET/PUT/DELETE /auth/me/preferences[/{key}]`, DELETE **idempotent 204**; isolation is structural —
  the service takes the user id from the session, every query filters by it in SQL, and the acceptance
  test runs two users on one key). Gating split (C30): `GET /auth/me` stays exempt during a forced
  change; `PATCH /auth/me` and all preferences endpoints take the gate. `ON DELETE CASCADE` on
  preferences (personal data, no audit value — the mirror of settings' SET NULL). DECISIONS C30; +8
  backend tests (**220 passing**); frontend unchanged (472); `openapi.json` + types regenerated).
- **Next task: F042 — Profile UI.** "Profile and security page with editable allowed fields." Accept
  (TASKS.md): "Save/error tests". BP-7.6/§4's page tree: `/profile` (card with name/email/roles/active/
  created info, editable self fields — full name, phone — view-only effective permissions as
  appropriate, security CTA) and `/profile/security` (own password change — **reuse the F032
  `ChangePasswordPage` or link to `/change-password`**; session security info if cheap). Route
  registration for BOTH pages (`requiredPermissions: []` — any signed-in user; NOT under /admin;
  showInNavigation: false per §4's nav spec — "profile is accessible from the top-right and
  sidebar-footer avatar menus"; wire the account-menu's profile item that F032 deliberately left
  unlinked). Decisions to record (C31): how /profile and /profile/security split (or one page with a
  security card); whether the effective-permissions view is a list or grouped; profile fields use
  the F041 PATCH with the same nested/none-dotted RHF shape (no dots in these field names — plain
  form). Consumption note: `/profile` is the natural first consumer of the preferences API (F048
  still owns table prefs) — keep F042 to profile fields + links; do not build the theme/profile-prefs
  UI here.
- Git: branch `main`, one commit per completed task; the tree is clean after each commit. F041 sits on top of
  `4ae921a` (the F040 byte repair).
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
- **Profile and preferences are live (F041):** `PATCH /auth/me` — full name/phone only,
  `extra="forbid"` (email stays admin-managed; an attempt is 422, never a silent no-op), response is
  the full `MeResponse`. Preferences: `user_preferences` (**migration `0006`**) — JSONB under unique
  `(user_id, key)` (free-form keys, lowercase dotted shape enforced twice, 8 KiB value cap, JSON null
  refused), `GET/PUT/DELETE /auth/me/preferences[/{key}]` with **idempotent 204** deletes; isolation
  is structural (session-derived id, SQL filters; two-users-one-key test). Gating: `GET /auth/me`
  exempt during a forced change; `PATCH /auth/me` + preferences take the gate. **Tests:** 8 new in
  `tests/test_profile_api.py`, `uv run pytest` is now **220 passed**.
- **The settings editor is live (F040):** `/admin/settings` — Branding + Display **Card sections**
  under **one** form and one Save (the wire is one bare-map PUT; per-card saves would be partial
  success in costume). The form is **nested where the wire is flat** (C29): RHF reads dotted field
  names as paths, `reset` stores verbatim — the §12 trap — with `toRegistryPayload` rebuilding the
  flat map; server 422s land on the matching nested field. Timezone input suggests real zones
  (`Intl.supportedValuesOf('timeZone')`, server still the validator); date format is a select over
  the five; no `settings.manage` → a read-only view. **Consumption deferred** (C29): the shell still
  reads `config/branding.ts`; F047/F048 design the shared read with its first consumer. **Tests:** 6
  new in `tests/admin/settings.test.tsx`, `pnpm exec vitest run` is now **472 passed**.
- **Settings are live (F039):** `app_settings` (**migration `0005`**) over the code registry
  (`app/core/settings_registry.py`): typed specs with defaults — unwritten keys read as their defaults,
  a new key later just starts there. `GET /admin/settings` (`settings.read`) → `{values: {...}}`;
  `PUT` (`settings.manage`) takes the **bare map** (registry keys → values), validates **everything
  before the first upsert**, one commit, returns the fresh snapshot; refusals are 422 at
  `loc ["body","<key>"]` (F040's form fields must carry the registry keys). `updated_by` is SET NULL.
  No DELETE verb — PUT-to-default is the reset. Not settings, by design (C28): Argon2 params, session
  lifetimes/throttles, secrets. **Tests:** 8 new (incl. the two restart proofs — expunge-and-reread,
  and a genuine write-close-reopen on its own connection), `uv run pytest` is now **212 passed**.
- **The dictionary screen is live (F038):** `/admin/permissions` — client-mode DataTable (code
  sortable/mono + description, toolbar search, view options; `admin-permissions` preferences key),
  Add/Edit/Delete behind `permissions.manage` mirrors (the server refuses regardless). Refusals are
  the server's sentence wherever they land: 422 shape → the code field; 409 duplicate → the create
  dialog's root alert; in-use rename → the edit dialog's root alert; in-use delete → the query
  layer's toast after the confirmation closes. A local `resource.action` regex is UX-only. Route
  registered (third admin route). **Tests:** 9 new in `tests/admin/permissions.test.tsx`, `pnpm exec
  vitest run` is now **466 passed**.
- **The permission dictionary is complete (F037):** `/api/v1/admin/permissions` — list/get
  (`permissions.read`), create/patch/delete (`permissions.manage`): **a code in use is frozen**
  (rename/delete → 409 while any role holds it — grants mean "the code as it reads"), descriptions edit
  freely, unused codes rename/delete; the code shape is the model's own pattern (422, never silently
  lowercased) and duplicates are the index's 409; **no subset rule on the dictionary by design** (C26 —
  creating a code confers nothing; the seeded codes are all in use via `super_admin` and therefore
  frozen; seed idempotence preserved). New `services/permissions.py`; router + schemas extended.
  **Tests:** 7 new in `tests/test_admin_permissions.py` (9 there now), `uv run pytest` is now
  **204 passed**.
- **The matrix screen is live (F036):** `/admin/roles` — permissions grouped by namespace (rows,
  with descriptions) × roles (columns), every intersection a checkbox. **A tick is draft state** (no
  request per cell — the C24 discipline made visible); the **save bar** counts unsaved changes and
  sends the whole visible matrix in ONE `PUT /admin/roles/matrix` (unchanged `is_system` column
  included; success re-reads the catalogue). The draft survives any failure — the bar shows the
  server's sentence (for 422s, the `fieldErrors` entries: the normaliser hides array-shaped details,
  so `saveErrorText` reads them) — and only a success re-seeds. `super_admin`'s column renders
  read-only (disabled boxes + lock; Rename/Delete disabled — mirrors only). Create/rename/delete live
  in column menus/dialogs and never touch grants. F019's guard blocks navigation while dirty. The
  page reads two pulled-forward slices: `GET /admin/permissions` (F037 extends) and the F034 roles
  list. **Tests:** 13 new in `tests/admin/roles.test.tsx`, `pnpm exec vitest run` is now **457
  passed**; backend 197 (+2: `tests/test_admin_permissions.py`).
- **The role API is complete (F035):** `/api/v1/admin/roles` — list/get (`roles.read`, items now carry
  sorted `permission_codes`), `POST ""` (create with grant codes; unknown codes 422 on
  `permission_codes`; duplicate name 409), `PATCH /{id}` (name/description only — grants are the
  matrix's business), `DELETE /{id}` (204; **409 while assigned** with the count — the cascade must not
  silently strip authority), and **`PUT /matrix`** — the atomic save: entries `{role_id,
  permission_codes}` validated **before the first write** (role exists → `roles.<i>.role_id`; codes
  exist → `roles.<i>.permission_codes`; subset rule on old *and* new sets → 403; `super_admin`
  unchanged allowed, changed 403), one commit, 204. All mutations guard `roles.manage` — which the
  seeded `admin` deliberately lacks (C16). Sessions are **not** revoked for role edits (C24 — per-request
  re-evaluation is the guarantee). New `services/roles.py`; `ensure_codes_assignable` extracted in
  `services/users.py` (one subset-rule spelling). **Tests:** 12 new in `tests/test_admin_roles.py`
  (14 there now), `uv run pytest` is now **195 passed**.
- **The users screen is live (F034):** `/admin/users` (`pages/admin/users.tsx` +
  `pages/admin/user-dialogs.tsx`) — the first **server-mode DataTable** consumer: page/sort/search/status
  are query parameters (one state record feeds the query key), `total` drives the footer, `placeholderData`
  keeps the old page while the next loads; **no faceted filter for status** (facet counts are loaded rows —
  quietly wrong against a server page; a controlled `Select` carries it instead); **sorting is
  single-column and always on** (a cleared sort keeps the current order — the server never chose "unsorted").
  Dialogs: **create** (role checkboxes from the catalogue, empty password = generate; the one-time notice
  distinguishes generated vs admin-supplied per C22), **edit** (complete editable set on save; roles/active
  disabled when editing yourself — C22's self rule), **reset** (confirm → the same one-time notice);
  deactivate/delete behind destructive confirms. **Permission mirrors**: Add-user/reset/deactivate/delete
  items render only with their codes; the self row's deactivate/delete are disabled with the reason; the
  last-super-admin rule is deliberately NOT mirrored (needs a count the list lacks — the server's 409 is
  the interface). New kit component **`DataTableRowActions`** (trigger + surface; items by the page).
  The route registered (`/admin/users`, `adminOnly` + `users.read`) → **`/admin` now redirects here** for
  permitted callers and the **Administration group appears** for exactly them. The role picker reads
  **`GET /api/v1/admin/roles`** — a deliberate pull-forward of F035's read slice (sorted
  `{id, name, description, is_system}`, guard `roles.read`; C23 records why and F035 extends the router).
  Checks run: `pnpm run typecheck` clean; `pnpm exec vitest run` **444 passed** (14 new in
  `tests/admin/users.test.tsx`); `pnpm run build` OK (pre-existing chunk warning); backend `pytest`
  **183 passed** (2 new roles-slice tests); `openapi.json` + generated types regenerated.
- **The admin user directory is live (F033):** `/api/v1/admin/users` — `GET ""` (list: `page`,
  `page_size` ≤100 default 25, `search` over name+email with `%`/`_` **escaped**, `is_active`, `sort` ∈
  {`full_name`,`email`,`created_at` **desc default**,`last_login_at`} with an `id` tiebreaker, response
  `{items, total, page, page_size}` — count and rows from the same SQL criteria, soft-deleted always
  excluded), `POST ""` (201; explicit password policy-checked → 422 on `password` without echo, or
  generated → returned as `temporary_password` **once**; always `must_change_password`), `GET`/`PATCH
  /{id}` (`phone: null` clears; `role_ids` replaces the whole set; unknown role 422 on `role_ids`; email
  conflict 409 via the unique index), `POST /{id}/reset-password` (200 with the temporary once; F030
  mechanics), `DELETE /{id}` (204, **soft**: row kept, GET→404, email stays occupied, sessions revoked
  `admin`). Guards: `users.read`/`create`/`update`(+`users.deactivate` when `is_active` changes)/
  `reset_password`/`deactivate`. **Privilege rules** (`app/services/users.py`): superusers ↔
  superusers-only (403), role grants **⊆ caller's effective permissions** (403), own roles/active not
  editable here (403; own profile fields are), own deletion refused (403), **last active super-admin**
  protected (409 — before the self rules, after the target rule). Two kinds of 403: the guard's
  (generic) vs the rule's (specific messages). New: `app/api/v1/admin_users.py`,
  `app/services/users.py`, `app/schemas/admin_users.py`, `app/api/v1/errors.py` (`field_error` moved
  here — second consumer). No migration; `openapi.json` + generated types refreshed. **Tests:** 20 new,
  `uv run pytest` is now **181 passed**.
- **The SPA has a session (F032):** `src/lib/auth.tsx` — the one place the frontend's understanding of the
  session lives, with four statuses whose split *is* BIG-PROMPT §6.2e: `loading` → pending, a **clear 401**
  → `anonymous` → `/login` (intended in-app path kept in location state; `readIntendedPath` refuses
  anything but a single-slash path — no open redirect), network/5xx while resolving → **`error` → Retry**
  (a hiccup must never log anyone out), 200 → `authenticated` with `NavigationAccess` from `/auth/me`
  (login and change-password re-read it — one definition of the permission union). **Identity transitions
  clear the Query cache** (null↔id, id→other id — never a same-user refresh), the belt to `queryKeys`'
  id-in-key suspenders. **The 401 machinery (F018's) now has its handler**: single-flight re-resolution
  via `/auth/me`, the original request retried once, `/auth/*` never retried — no refresh endpoint exists
  (C12). **CSRF rides a request interceptor** (`lib/api.ts`): every unsafe method automatically carries
  `X-CSRF-Token` from the readable `__Host-csrf` cookie — a feature cannot forget it. **Routing**
  (`session-guard.tsx` + `app/router.tsx`): the shell sits behind `ProtectedShell`, `/login` and
  `/change-password` are standalone cards outside the shell (`/change-password` still requires a session
  and offers *sign out instead* — §6.1's recovery rule, not a dead end); the forced-change flag becomes a
  navigation, not a 403 wall. **`/login`** shows the server's uniform 401 verbatim (no enumeration
  branches anywhere), **`/change-password`** maps F030's field-addressable 422s onto its inputs (the API's
  field names ARE the form's field names) and shows the 429 sentence. The header's **account menu**
  (change password / sign out / sign out everywhere behind F019's confirmation) — Profile pages stay
  F042's, so no menu item links to one. `MeResponse.is_superuser` added to `/auth/me` (C21 amends C20).
  Checks run: `pnpm run typecheck` clean; `pnpm exec vitest run` **430 passed** (14 new in
  `tests/auth/auth-flows.test.tsx` — through the real route table, providers and `api.ts`, MSW the only
  stand-in); `pnpm run build` succeeds (pre-existing chunk-size warning only); the F017 route-state tests
  now state the session they assume (`buildAppRoutes(SIGNED_IN)`); `openapi.json` + generated types
  regenerated (430 at that commit; unchanged by F033 — no frontend code this time).
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
  sorted role names + the **expanded** sorted union — plus `is_superuser` since F032/C21 (the SPA's access
  model carries the flag; server truth beats a hardcoded false), no `is_active` (a disabled account's
  session never resolves) —
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
- **C21** — F032's session layer (the four-status provider — only a *clear* 401 redirects to `/login`,
  network/5xx shows Retry; `/auth/me` as the identity source; identity transitions clear the Query cache;
  the registered single-flight 401 re-resolution; the CSRF request interceptor; `ProtectedShell` +
  standalone `/login`//`change-password`; the account menu; `MeResponse.is_superuser` added, amending
  C20), same date and same basis; rationale in ARCHITECTURE §5/§12.
- **C22** — F033's admin user directory (the six guarded endpoints; superusers managed by superusers
  only; **role grants ⊆ the caller's own permissions**; no self-changes to roles/active; own deletion
  refused; **last active super-admin protected** (409, before the self rules, after the target rule);
  soft deletion with the email staying occupied; temp credentials shown once; SQL-filtered paginated
  list with the `id` tiebreaker and `total` from the same criteria; guard-403 vs rule-403; the F043
  audit gap recorded), same date and same basis; rationale in ARCHITECTURE §6/§12.
- **C23** — F034's users screen (the deliberate pull-forward of `GET /admin/roles` as F035's read
  slice; the server-mode table rules — no faceted filter, single always-on sort, `total` from the
  server; `DataTableRowActions`; the shared one-time password notice; permission mirrors with the self
  row disabling and the last-super-admin 409 left to the server; the route registration that makes
  `/admin` redirect), same date and same basis; rationale in ARCHITECTURE §5/§12.
- **C24** — F035's role API and matrix (the atomic validate-everything-then-one-commit save; the subset
  rule on old and new sets with one shared primitive; `is_system` seed-owned but unchanged matrix
  entries accepted; deletion refused while assigned; codes — not ids — in payloads; role edits do not
  revoke sessions, superseding §3's table wording), same date and same basis; rationale in
  ARCHITECTURE §5 (the role API section)/§12.
- **C25** — F036's matrix screen (the permissions read slice pulled forward from F037; the
  draft-not-a-form model with one save; seeding rules; the save bar as the single failure voice with
  `fieldErrors` preferred; the read-only seed column; one grant-write path; the guard on navigation),
  same date and same basis; rationale in ARCHITECTURE §5/§12.
- **C27** — F038's dictionary screen (client-mode on the unpaginated list; server-sentence refusals
  in whichever surface fits — field/dialog-root/toast; local shape check as UX only; no client-side
  usage guessing), same date and same basis; rationale in ARCHITECTURE §5/§13.
- **C28** — F039's settings (the registry-as-allowlist with typed specs and defaults; the `0005`
  `app_settings` table with `updated_by` SET NULL; the bare-map PUT validated entirely before the
  first upsert; no DELETE verb; the deliberately-not-settings list; `tzdata` added for IANA
  validation), same date and same basis; rationale in ARCHITECTURE §5/§9/§13.
- **C29** — F040's settings editor (Card sections over one atomic save; the nested-form/flat-wire
  split with the RHF dotted-name trap recorded in §12; the browser's own IANA list as suggestions
  while the server validates; read-only without `settings.manage`; consumption deferred to F047/F048
  with its reason — a non-admin cannot read the admin settings endpoint), same date and same basis;
  rationale in ARCHITECTURE §5/§12.
- **C30** — F041's profile and preferences (`PATCH /auth/me` owned-fields-only with
  `extra="forbid"`; the `0006` `user_preferences` table with the free-form vocabulary (contrast
  with settings' registry), key pattern + 8 KiB cap + null-refusal, idempotent DELETE, structural
  session-scoped isolation, CASCADE edges, and the gating split where only `GET /auth/me` is
  exempt), same date and same basis; rationale in ARCHITECTURE §5.
- **C26** — F037's permission dictionary (the in-use freeze — rename and delete both 409 while granted;
  descriptions free; refused-not-normalised codes against the model's own pattern; duplicates via the
  unique index's 409; **no subset rule by design** — grants are where escalation lives; seed
  idempotence preserved across operator-added codes), same date and same basis; rationale in
  ARCHITECTURE §5/§12.
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

- **Frontend tests are not type-checked.** `tsconfig.json` includes `src` and `vite.config.ts` only;
  `tests/**` runs through Vitest's transform with no `tsc` pass, so a test fixture can drift behind a
  generated type silently (F034's `RoleItem` fixtures did, discovered in F035). When a generated DTO
  changes shape, grep `tests/` for its fixtures; F056's CI gate should consider adding a test-aware
  typecheck (`vitest --typecheck` or a second tsconfig).
- **Editing files containing Windows paths from scripted writes (Bash heredoc + python) mangles
  backslashes on this machine** — escape sequences for CR, backspace and form-feed can land as
  real control bytes inside `NEXT_PROMPT.md` and similar files, corrupting paths invisibly to
  review. Prefer the Edit tool for these edits; after any scripted write, verify with a
  control-byte scan (`python -c "d=open('NEXT_PROMPT.md','rb').read(); print(d.count(chr(13)), d.count(chr(8)), d.count(chr(12)))"`
  → `0 0 0`) and repair byte-level if needed (`chr(...)` instead of escape sequences, for
  obvious reasons).
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
- **The session layer's contracts are load-bearing (F032, C21):** only a *clear 401* may send anyone to
  `/login` — an unreachable server renders Retry, and no future screen may "helpfully" redirect on a
  network error. Unsafe requests get `X-CSRF-Token` from the api.ts interceptor — never hand-attach it,
  never bypass `lib/api.ts` (axios directly), because the interceptor IS the CSRF guarantee. New
  user-scoped queries must carry the user id in their key (`queryKeys`, F018) — the provider's
  cache-clear on identity change is the belt, the key is the suspenders. Admin pages are **not** added to
  the frontend nav until F034 registers them (a registered route is a rendered link); when F033 adds
  `/admin/*` endpoints, the frontend keeps consuming them through `lib/api.ts` + generated types only.
  `MeResponse.is_superuser` is real data now — do not re-derive authority from grant-list length.
- **Server-mode tables follow F034's shape (C23):** request parameters in one page-level state
  record, the server's `total` for the footer, `placeholderData` over skeletons on refetch, no faceted
  filter (its counts are loaded rows), one always-on server sort, and row actions through
  `DataTableRowActions`. Permission mirrors hide controls the caller cannot use; they never replace the
  server's check. Preferences keys are per screen (`admin-users` today).
- **F041's ownership rules are F042's contract (C30):** profile edits go through `PATCH /auth/me`
  (never a preferences key for name/phone); preference keys are lowercase dotted strings the
  frontend owns — F048 must keep its keys within that shape and its values under 8 KiB; the
  preferences API is session-scoped by construction, so no UI needs to pass a user id; forced-change
  users cannot reach any of it except `GET /auth/me`.
- **The settings-editor pattern is F041+'s canvas (F040, C29):** nested form where the schema's
  names are dotted, flat payload at the wire; one form per atomic write; read-only without the
  manage code; suggestions come from real sources (browser lists), never hand-kept tables.
- **Settings contracts for F040/F045 (F039, C28):** the registry key strings ARE the form field
  names and the 422 `loc` paths — do not rename them in the UI; write through the bare-map PUT
  (per-key PATCH does not exist); unwritten keys are defaults, so a form must render the snapshot, not
  blanks; secrets never enter `app_settings`. **Downgrade-base is for scratch databases only** — the
  §8 round-trip row now targets `app_test`; never run it against `app_dev`.
- **F038's screen closes the admin-UI trio (C27):** new admin screens follow the same pattern —
  client-mode only for deliberately-unpaginated lists, mirrors on the codes the server enforces,
  refusals rendered as the server's sentence, preferences under `admin-<thing>`. F040's settings
  screen will be the first *non-admin-catalog* consumer of the patterns.
- **The dictionary's guardrails are F038's contract (F037, C26):** the in-use 409 is the interface
  for rename/delete refusals (the list carries no usage counts — do not fake one client-side); codes
  are refused, never normalised; a create dialog never needs a subset check (creating confers
  nothing). F038's table is **client-mode** (the list is intentionally unpaginated); dialogs mirror
  `permissions.manage`; the 409s render as the server's sentence.
- **The matrix screen's model is the page's contract (F036, C25):** a tick is draft state and the
  ONLY grant write is one atomic `PUT /admin/roles/matrix` — never add a per-cell request or a second
  grant path (a rename form carrying checkboxes is the reference's bug in a new costume); the draft
  seeds once and survives every failure; `super_admin` renders read-only from `is_system`; surfaces
  that show an error read `fieldErrors` before settling for the normaliser's fallback sentence.
- **The role API's rules are F036/F037's foundation (F035, C24):** the matrix save is the ONLY way
  grants change (never a per-cell request — the rollback guarantee dies with it); `is_system` renders
  read-only and its unchanged entry may ride the save; unknown codes/per-role errors are addressed at
  `roles.<i>.<field>`; deletion stays refused while assigned; role edits keep no session revocation —
  do not add one without amending C24 and §3 together. F037's permission CRUD must apply the same
  subset rule (`ensure_codes_assignable`) in both directions and treat the code vocabulary as
  server-registered rows (never invented client-side).
- **The admin API's rules are the security surface (F033, C22) — F035/F037 reuse them:** the subset
  rule for grants (`_ensure_roles_assignable`) is the escalation guard every future role/permission
  mutation must also apply (F035's matrix edit and F033's role assignment answer to the same rule);
  superuser targets stay superuser-managed; the last-active-super-admin check is `users.py`'s to reuse,
  not to re-implement. Keep the two 403 dialects apart in new endpoints: guard-403 generic, rule-403
  specific. Soft-deleted users answer 404 everywhere and their email is occupied forever — F034's
  create dialog must render the 409, not retry it. **When F043 lands the audit store, the F033
  mutations (create/update/deactivate/delete/reset) are on its backfill list** (C22 records the gap).
  `sort` on the list is an enum, `page_size` is capped at 100 — do not widen either silently; F034's
  table maps its column headers onto exactly this allowlist.
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

- **F041 — Profile API.** The endpoints behind `/profile` and `/profile/security`'s data needs, split
  along one ownership rule each (C30). **`PATCH /auth/me`** joins F031's `/auth/me` in the auth
  router and edits exactly the fields a user owns — full name and phone; **email is admin-managed**
  (§7.3), and `extra="forbid"` makes a payload trying anyway a 422 at the unknown field instead of
  the silent no-op that "we accepted it and nothing happened" would be; absence vs explicit null
  follows the F033 convention (null clears the phone); the response is the same `MeResponse` the GET
  serves, so a client that just saved has the fresh identity. **Preferences** are the `0006`
  `user_preferences` table — JSONB values under a unique `(user_id, key)`, §8.2's model — with a
  **free-form vocabulary by deliberate contrast with settings' registry**: a preference is personal
  display data with no authority, and the moment a key carried authority it would be a setting
  instead. The guards are the key's lowercase dotted/dashed/underscored shape (the model's pattern,
  enforced by the API as a 422 at `loc ["path","key"]` and by a database CHECK), a serialized value
  cap of 8 KiB (422, not a parse problem), and the refusal of JSON null — deleting the key IS the
  nulling, because "no preference" must have one spelling. The three endpoints are §8.3's:
  `GET /auth/me/preferences`, `PUT /auth/me/preferences/{key}` (upsert, returns the item), `DELETE`
  (**idempotent 204** — the goal state holds whether or not a row existed; a malformed key is still
  a 422). **Isolation is structural, not a filter**: the service's functions take the user id from
  the session — there is no parameter through which another user's id could arrive — and every query
  filters by it in SQL (BP-8.2); the acceptance runs two users on the same key and asserts each
  other's snapshots stay byte-identical. **The gating split** (C30's second half): `GET /auth/me`
  stays on the forced-change exemption list (the SPA reads the flag there), while `PATCH /auth/me`
  and every preferences endpoint take the gated `current_session` — they are regular mutations. The
  CASCADE edge is the deliberate mirror of settings' SET NULL: a deleted user's display preferences
  are personal data with no audit value. Checks run: `uv run pytest` **220 passed** (8 new in
  `tests/test_profile_api.py`); `ruff check`/`format --check` clean; `mypy app migrations` clean (54
  files); **migration `0006`** applied to `app_dev`, the chain round-trip clean on `app_test`;
  `openapi.json` + generated frontend types regenerated (frontend unchanged: 472).
- **F040 — Settings UI.** `/admin/settings` — the editor for F039's registry, shaped by what the wire
  actually is. **Card sections, one form, one save**: Branding (name, description) and Display (date
  format, timezone) render as separate cards but share a single `<form>`, because the API's write is
  one bare-map `PUT` — per-card saves would be partial success in a new costume. The form is
  **nested where the wire is flat** (C29): React Hook Form reads a dotted field name as a path while
  `form.reset` stores its argument verbatim, so the first flat-schema draft validated the *seeded*
  values and silently ignored every *typed* one — ARCHITECTURE §12 now records the trap. The schema
  mirrors the registry keys as nested objects, `toRegistryPayload` rebuilds the flat map at submit,
  and the server's dotted 422s land straight on the matching field through `applyServerErrors`. The
  timezone input suggests real IANA zones via `Intl.supportedValuesOf('timeZone')` — the browser's
  own list, no hand-kept table — while the server remains the validator; the date format is a select
  over the source's five; without `settings.manage` the page is a read-only view. **Consumption is
  deliberately deferred** (C29): the shell still shows `config/branding.ts`, nothing consumes
  `display.date_format` yet, and F047/F048 will design that shared read surface together with its
  first real consumer — a non-admin cannot read the admin settings endpoint anyway, so a display-read
  needs its own guarded design rather than a convenience shortcut. Route registered
  (`/admin/settings`, `settings.read`, `adminOnly`, Settings icon) — the fourth admin route. Checks
  run: `pnpm run typecheck` clean; `pnpm exec vitest run` **472 passed** (6 new in
  `tests/admin/settings.test.tsx`: seeding/reload from the snapshot, re-seed from the save response,
  local validation without a request, the server's per-key 422 on the named field, one bare-map PUT
  with all four keys, and the read-only mirror); `pnpm run build` succeeds; backend re-run confirmed
  at 212.
- **F039 — Settings backend.** The application's runtime settings, and the first migration since
  `0004`. The design is the **registry as allowlist** (BP-7.5): `app/core/settings_registry.py`
  declares four typed specs — `branding.app_name` (3–64), `branding.app_description` (0–200),
  `display.date_format` (the source's five formats), `display.timezone` (validated against IANA via
  `zoneinfo`; **`tzdata` became a dependency** because Windows ships no tz database) — each with a
  default and a validator whose messages name the rule and never echo the value (F026's rule). The new
  `app_settings` table (**migration `0005`**, applied to `app_dev`; the full round-trip verified against
  `app_test` — **never** `downgrade base` on dev) stores **overrides only**: unique `key`, JSONB
  `value` validated before it gets anywhere near the table, `updated_by` FK **SET NULL** (attribution,
  not ownership — deleting a user must not delete the setting; tested), and **no row at all for a
  default**, so a fresh deployment needs no seeding and a key added in a later release simply starts at
  its default. `GET /admin/settings` (`settings.read`) serves the snapshot — defaults overlaid with
  stored rows; the write is a **bare-map `PUT`** (`settings.manage`): every key and value validated
  **before the first upsert**, one commit (F035's matrix discipline in miniature), the fresh snapshot
  back, refusals addressed at `loc ["body","<key>"]` — which is why F040's form field names are the
  registry keys. No DELETE verb exists: putting a key back to its default is the same outcome with a
  clearer history. What is **deliberately not a setting** is as designed as what is: the Argon2
  parameters (F026's reviewed constants), session lifetimes and login throttles, and every secret
  (BP-7.5); notification keys arrive with F045 when their behaviour exists. The restart acceptance is
  proven twice: the snapshot re-reads after `expunge_all` (row-backed, not memory), and a genuine
  write–close–reopen on **its own connection** (cleaned up in a `finally`). DECISIONS C28. Checks run:
  `uv run pytest` **212 passed** (8 new in `tests/test_admin_settings.py`); `ruff check`/`format
  --check` clean; `mypy app migrations` clean (49 files); `0005` applied to `app_dev`; `openapi.json` +
  generated frontend types regenerated (frontend unchanged: 466).
- **F038 — Permissions UI.** `/admin/permissions` — the dictionary screen (F038, BP-7.4), closing the
  admin-catalogue trio (users, roles, permissions). A **client-mode** DataTable over the deliberately
  unpaginated list (C25/C26): code column sortable and monospaced, description beside it, the kit's
  toolbar search and view options doing the work — no re-implementation, and preferences persist under
  `admin-permissions`. Management controls render behind `permissions.manage` mirrors (§6.3d); the
  server refuses regardless. **Every refusal stays the server's sentence, each in the surface that
  fits it**: the local `resource.action` regex is UX only and the server's 422 still lands on the
  `code` field; a duplicate answers 409 into the create dialog's root alert; the in-use rename freeze
  renders in the edit dialog's root alert; the in-use delete arrives as the query layer's toast once
  the confirmation closes — the page never guesses usage, because the list deliberately carries no
  counts (C27). Route registered (`/admin/permissions`, `permissions.read`, `adminOnly`, Lock icon) —
  the third admin route; `/admin` still resolves users-first. Checks run: `pnpm run typecheck` clean;
  `pnpm exec vitest run` **466 passed** (9 new in `tests/admin/permissions.test.tsx`); `pnpm run
  build` succeeds; backend untouched (204 passed, re-run to confirm).
- **F037 — Permission API.** The `/admin/permissions` router F036's read slice opened is complete, and
  its guardrails are shaped by what a permission code *is* (C26). Create/patch/delete sit behind
  `permissions.manage` — the code the seeded `admin` deliberately lacks (C16). **A code in use is
  frozen in spelling**: renaming or deleting a code any role holds answers 409 (the service exception
  carries the assignment count) — live grants mean "the code as it reads", so a rename would silently
  rewrite what every holder authorises and a delete would silently strip authority (F035's
  delete-while-assigned rule, applied to the other end of the grant edge). Descriptions carry no
  authority and edit freely; an *unused* code renames (the typo caught before the first grant) or
  deletes. **Codes never collide or normalise silently**: the shape is the model's own
  `PERMISSION_CODE_PATTERN`, imported not re-stated, enforced at the schema — `Users.Read` is refused
  with a 422, never quietly lowercased into a different authority — and duplicates are the unique
  index's 409. **No subset rule on the dictionary, deliberately**: creating a code confers nothing (the
  matrix save's subset check governs the moment anyone grants it), and requiring the editor to hold a
  code that does not exist yet would be an unsatisfiable rule; the seeded codes protect themselves —
  `super_admin` holds all 17 (C16), so every seeded code is in use, therefore frozen. **Seed
  idempotence preserved**: operator-added codes survive every seed run (create-if-missing; existing
  rows never modified). En route, the F035 collection trap was met again and sharpened: `populate_existing`
  re-applies the mapper's *default* strategy, and `Permission.roles` has no `selectin` default — the
  getter says `selectinload(...)` explicitly (ARCHITECTURE §12, updated). Checks run: `uv run pytest`
  **204 passed** (7 new in `tests/test_admin_permissions.py`); `ruff check`/`format --check` clean;
  `mypy app migrations` clean (43 files); **no migration** (`0004` remains head); `openapi.json` +
  generated frontend types regenerated (frontend suite unchanged: 457).
- **Docs/lessons sweep (operator request, after F036).** Every lesson from F028–F036 is now in the
  specs, and the docs-location audit is recorded: **all specs live in-repo** — the pack (`BIG-PROMPT.txt`
  verbatim, hash-verified against the archive) and `docs/` carry everything the tasks read; the only
  external items are deliberate (the third-party reference tree `D:\QTC360\qtc360\`, read-only, and the
  archive originals in `D:\RESORS_REFERENCE\` kept as audit records). The seven audit-required documents
  not yet written (README, SECURITY, DEPLOYMENT, BACKUP_RESTORE, ADDING_A_MODULE, TESTING,
  IMPLEMENTATION_LOG) are future-task deliverables (audit §9), not strays. Newly recorded lessons:
  Starlette renamed the 422 constant (`HTTP_422_UNPROCESSABLE_CONTENT`; a per-response deprecation
  warning) and httpx will not store `Secure` cookies from `http://` URLs (ARCHITECTURE §12); frontend
  tests are not type-checked (`tsconfig` excludes `tests/**`) and scripted edits of files holding
  Windows paths can mangle backslashes into control bytes on this machine — scan after writing
  (NEXT_PROMPT §6).
- **F036 — Role matrix UI.** `/admin/roles` — the UI half of BP-7.4's atomicity, whose central
  decision is what a tick *is*: **draft state, never a request**. The matrix renders every permission
  code grouped by namespace (rows, with descriptions) against every role (columns), and however many
  cells an editing session touches, the save bar counts them as **one unsaved state** — the wire sees
  exactly one `PUT /admin/roles/matrix` carrying the whole visible matrix, the protected `is_system`
  column included and unchanged (exactly the payload F035/C24 accepts). The reference's per-cell
  PATCH loop cannot be recreated through this screen even by accident. Mechanics worth keeping (C25):
  the draft seeds **once** (`draft === null` gates the effect, so background refetches cannot clobber
  edits in progress), Reset re-seeds on demand, a successful save re-seeds through `setDraft(null)` +
  invalidate — the bar always compares draft against the server's current answer. **The save bar is
  the single voice of failure** (`suppressErrorToast`): the server's sentence, with the
  `fieldErrors` *entries* preferred for 422s (the F018 normaliser deliberately hides array-shaped
  details behind its fallback sentence — `saveErrorText` reads them), and **the draft survives any
  failure**; a failed save that looks like a lost edit is the wrong lesson. The seed-owned column
  renders read-only (disabled checkboxes + lock + disabled Rename/Delete — mirrors of the server's
  rule, which refuses regardless), navigation with unsaved edits goes through F019's
  `UnsavedChangesGuard`, and create/rename/delete (column menus + dialogs) **never touch grants** —
  one write path keeps "atomic" a property of the system, not of one endpoint. The screen reads two
  pulled-forward read slices: `GET /api/v1/admin/permissions` (C25 — the matrix's row labels ARE the
  catalogue; F037 extends that router) and F034's roles list. Route registered (`/admin/roles`,
  `roles.read`, `adminOnly`) — the second admin route. Checks run: `pnpm run typecheck` clean;
  `pnpm exec vitest run` **457 passed** (13 new in `tests/admin/roles.test.tsx`: the grid from the
  catalogue, the read-only column, tick-is-not-a-request, one-PUT-includes-the-unchanged-protected-
  column, reset, untick-clears, the 422 with its entry message and the surviving draft, the rule 403,
  the navigation guard, create/duplicate-conflict/rename/delete); `pnpm run build` succeeds; backend
  `pytest` **197 passed** (2 new permissions-slice tests); `openapi.json` + generated frontend types
  regenerated and committed.
- **F035 — Role API.** The `/admin/roles` router F034 opened is complete, and the acceptance's two
  halves — rollback and escalation — are structural rather than hoped for. **Create/patch/delete** under
  `roles.manage`, the code the seeded `admin` deliberately lacks (C16: editing the authority
  dictionaries is escalation by definition): names trimmed and unique (409 via the index), descriptions
  normalised, `is_system` roles refused for rename/delete (the seed owns the row), deletion refused
  while the role is assigned (409 with the count — `user_roles` cascades, and a cascade that silently
  strips authority is the accident the safeguard exists to prevent). **`PUT /admin/roles/matrix` is the
  atomic save** BP-7.4 demands in place of the reference's sequential-PATCH partial success: the payload
  carries each role with its complete code set; every entry is validated — role exists
  (`roles.<i>.role_id`), `is_system` rule, **the subset rule on the old *and* the new grant set**, every
  code exists (`roles.<i>.permission_codes`) — **before the first write**, then one commit applies all
  replacements. The rollback test is the proof of shape: entry zero is valid and stays unsaved because
  entry one was not. The subset rule itself is one primitive now (`ensure_codes_assignable`, extracted
  in `services/users.py` and shared with F033): you may grant only what you hold, and you may edit only
  roles whose current grants you hold. `super_admin`'s column: an **unchanged** matrix entry is
  accepted (a UI submits its whole visible matrix without special-casing one column), any actual change
  is 403. Payloads name permissions by **code** (the machine vocabulary); duplicates deduplicate.
  `RoleItem` gained sorted `permission_codes` — the matrix screen reads roles and grants in one answer.
  One honest supersession, recorded rather than silent (C24): **role edits do not revoke sessions** —
  per-request re-evaluation (C20/BP-6.3f) is the guarantee, and signing every holder out for an edit
  they may not lose access from would be disruption without a security gain; §3's table wording is
  superseded on this point. Checks run: `uv run pytest` **195 passed** (12 new in
  `tests/test_admin_roles.py`); `ruff check`/`format --check` clean; `mypy app migrations` clean (40
  files); **no migration** (`0004` remains head); `openapi.json` + generated frontend types regenerated
  (frontend suite unchanged: 444). Two fresh ARCHITECTURE §12 entries earned en route: assigning a
  secondary collection lazy-loads the old contents (a `MissingGreenlet` three frames from the
  "assignment"), so grant reads now come from SQL (`_current_codes`) and mutable roles are fetched
  through a `populate_existing` getter.
- **F034 — Admin users UI.** `/admin/users` — the first real consumer of two kits (F020's server mode,
  F021's preferences) and the first administration screen. The page (`pages/admin/users.tsx`) holds one
  state record for page/sort/search/status; all four feed the query key, the server's `total` drives
  the footer, and `placeholderData` keeps the previous page visible while the next arrives. Three
  deliberate shapes (C23): **no faceted filter** for the status column (facet counts are computed from
  *loaded* rows — the component is used where that is exact, client tables; a controlled `Select` carries
  the server filter), **single-column always-on sorting** (the API sorts by one allowlisted field with an
  id tiebreaker; a cleared sort keeps the current order rather than showing an order the server never
  chose), and **rules mirrored only where visible**: Add-user/reset/deactivate/delete controls render
  only with their codes (§6.3d — the server stays the boundary), the self row disables
  deactivate/delete with the reason (C22's self rules), and the last-super-admin rule is *not* mirrored
  — it needs a count the list does not carry, so the server's 409 is the honest interface. The dialogs
  (`pages/admin/user-dialogs.tsx`): create (role checkboxes from the catalogue; empty password =
  generate), edit (the complete editable set on save; roles/active disabled when editing yourself), and
  reset behind its own confirmation — create and reset share the **one-time password notice** ("shown
  once", Copy) because C22 made their contracts identical, and the create dialog distinguishes generated
  (shown) from admin-supplied (not echoed) exactly as the API does. One kit addition:
  **`DataTableRowActions`** — the component the data-table index had promised for F034 (trigger +
  surface owned by the kit, items by the page, nothing rendered for an empty menu). The route is
  registered with `adminOnly` + `users.read`, so **`/admin` now redirects to `/admin/users`** for
  permitted callers and the Administration group appears for exactly them. The role picker reads
  **`GET /api/v1/admin/roles`** — a deliberate pull-forward of F035's read slice (C23): the picker's
  options must be the real catalogue, and neither an invented list nor an inert multiselect is
  acceptable; F035 extends that router with CRUD and the matrix. Checks run: `pnpm run typecheck` clean;
  `pnpm exec vitest run` **444 passed** (14 new in `tests/admin/users.test.tsx` — rendered through the
  real route table, providers and `api.ts`, MSW the only stand-in: server params per control, the
  one-time contract, the 409 in the dialog, both confirm flows, the self/permission mirrors, the empty
  state); `pnpm run build` succeeds; backend `pytest` **183 passed** (2 new roles-slice tests);
  `openapi.json` + generated frontend types regenerated and committed.
- **F033 — Admin user API.** The user directory, with the acceptance's privilege half doing the real
  work. Six endpoints under `/api/v1/admin/users`, each behind one F031 guard, with every business rule
  in `app/services/users.py` (endpoints translate; the service decides): **superusers are managed by
  superusers only** — every verb including creation; **a role grant must be a subset of the caller's
  effective permissions**, so the seeded catalogue makes escalation exact (a plain `admin` holds every
  code the `admin` role has and can grant it; `super_admin` is grantable only by a superuser); **nobody
  edits their own roles or active flag** through this API (self-demotion refused; own name/email/phone
  stay editable — F042's future home); **own deletion refused**; and **the last active super-admin
  cannot be deactivated or deleted** — 409, checked *before* the self rules (so the last super-admin
  deactivating themselves hears the platform's reason) and *after* the superuser-target rule (so an
  unauthorized caller learns nothing about super-admin counts). **Deletion is soft**: the row survives
  for audit, every session ends in the same commit (`admin` — F030's primitive), GET-by-id answers 404,
  the list hides the account, and the email stays occupied — an account is never silently reborn.
  **Create/reset install temporary credentials shown exactly once** (`must_change_password` always
  true; explicit passwords are policy-checked → field-addressable 422 on `password`, never echoed;
  generated ones appear in the response only when the server made them). **The list filters in SQL** —
  escaped ILIKE search, `is_active`, a sort allowlist with `id` as tiebreaker (offset pagination needs
  a total order), `total` counted from the same criteria the rows come from. Two deliberate 403
  dialects: the guard's generic message vs the service's rule-specific ones; conflicts are 409; the
  F043 audit gap is recorded in C22. Also: `field_error` moved to `app/api/v1/errors.py` (second
  consumer), and two async-ORM traps were pinned in ARCHITECTURE §12 (`updated_at`'s SQL-expression
  `onupdate` costs a refresh after UPDATE; a service-level rollback empties the shared test session's
  identity map). Checks run: `uv run pytest` **181 passed** (20 new); `ruff check`/`format --check`
  clean; `mypy app migrations` clean (37 files); **no migration** (`0004` remains head); `openapi.json`
  + generated frontend types regenerated and committed.
- **F032 — Auth frontend.** The SPA now has a session, and §6.2e's rules are structure rather than
  vigilance. `src/lib/auth.tsx` is the one place the client's understanding of the session lives —
  four statuses whose split *is* the requirement: `loading`; `authenticated` (from `/auth/me`, the one
  identity source — login and change-password re-read it); `anonymous` only on a **clear 401**; `error`
  on network/5xx, which renders **Retry and stays put** — a hiccup must never log anyone out.
  `ProtectedShell`/`RequireSession` (`components/layout/session-guard.tsx`) put that in front of the
  shell: anonymous → `/login` carrying the intended in-app path (readIntendedPath refuses anything but a
  single-slash path — an open redirect is impossible), forced change → `/change-password` (a navigation,
  not a 403 wall), and the shell receives the resolved `NavigationAccess`. Identity transitions
  (null↔id, id→other) **clear the TanStack Query cache** — the belt to F018's id-in-key suspenders; a
  same-user refresh never clears. The F018 401 machinery got its handler: single-flight `/auth/me`
  re-resolution and one retry, `/auth/*` never retried — there is no refresh endpoint (C12), and nothing
  pretends otherwise. **CSRF became an interceptor**: `lib/api.ts` attaches `X-CSRF-Token` from the
  readable `__Host-csrf` cookie on every unsafe method — impossible for a feature to forget. The
  **login page** is a standalone centered card (brand from `config/branding.ts`, theme toggle) showing the
  server's uniform 401 verbatim — no "no such account" branch exists anywhere — with shape-only client
  validation and honest autocomplete attributes; `/login` routes an already-authenticated visitor through
  (flag → `/change-password`, else the intended path). The **change-password page** serves the forced
  flow and future Profile > Security links: `current_password`/`new_password` are the API's own field
  names, so F030's field-addressable 422s land on the right inputs with zero translation; the confirm
  field is client-side; the 429 shows the server's sentence; a *sign out instead* escape answers §6.1's
  "recovery, not a dead end". The header gained the **account menu** (F032's promised owner):
  change password, sign out, and sign out everywhere behind F019's confirmation — Profile items stay
  unlinked until F042 registers that page. `MeResponse.is_superuser` was added to `/auth/me` (C21
  amends C20's omission — the SPA's access model carries the flag, and server truth beats a hardcoded
  false); `CardTitle`s on the auth cards wrap real `h1`s (the generated primitives render divs).
  Checks run: `pnpm run typecheck` clean; `pnpm exec vitest run` **430 passed** (14 new —
  `tests/auth/auth-flows.test.tsx` drives the real route table, provider stack and `api.ts` through MSW:
  anonymous redirect + intended-path return, the server-refusal display, local validation, the
  forced-change landing/bounce/completion (with the CSRF header asserted on the wire), 422 mapping onto
  inputs, mismatch refusal without a request, both sign-out flows, the **network-failure Retry**
  (§6.2e), and the registered 401 re-resolution retrying exactly once); `pnpm run build` succeeds
  (pre-existing chunk-size warning only); the F017 route-state tests now state their session
  (`buildAppRoutes(SIGNED_IN)`); `openapi.json` + generated types regenerated and committed.
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
| **Database migrations (F023–F041)** | `cd D:\resors\backend; uv run alembic upgrade head` | runs `0001` → `0002` (identity) → `0003` (sessions) → `0004` (rate-limit buckets) → `0005` (app settings) → `0006` (user preferences) on an empty database; a second run prints only the context lines (a no-op). `uv run alembic current` → **`0006 (head)`** (`app_dev` is at `0006`; F027–F038 added no revision, **F039 added `0005`**, **F041 added `0006`**); `uv run alembic history` shows the six revisions. **The round-trip check targets a scratch database only** — `downgrade base` drops every table it touches; derive the test URL in PowerShell: `$t = uv run python -c "from sqlalchemy.engine import make_url; from app.core.config import get_settings; print(make_url(get_settings().database_url).set(database='app_test').render_as_string(hide_password=False))"; $env:DATABASE_URL = $t; uv run alembic downgrade base; uv run alembic upgrade head; uv run alembic current` → ends **`0006 (head)`**. **Never run `downgrade base` against `app_dev`** |
| **Backend tests (F023–F041)** | `cd D:\resors\backend; uv run pytest` | **220 passed** — 5 schema conventions (no database needed) + 22 password/policy/generator + 12 rate-limit (5 pure window-math + 6 DB + 1 concurrency over real connections) + 18 RBAC constraints + 18 session + 11 seed + 17 bootstrap + 11 login + 13 session-lifecycle + 11 CSRF + 14 password-lifecycle + 9 authorization + 20 admin-users + 14 admin-roles + 9 admin-permissions + 8 admin-settings + 8 profile tests, all against a dedicated `app_test` database (created and migrated by the fixtures on first run; the development database is never touched) |
| **Login tests (F028)** | `cd D:\resors\backend; uv run pytest tests/test_auth_login.py` | **11 passed** — six credential-failure causes answered with the *same* 401 body, the unknown-email path proven to run a real Argon2 verification against the decoy (whose parameters are pinned current), both throttle buckets (per account and per address) incl. the identical 429 for a non-existent email, `hit_count == 5` persisted after five failures (commit-on-failure), the account-bucket reset on success, rehash-on-login, the exact cookie attributes, and 422 for malformed bodies |
| **Session lifecycle tests (F029)** | `cd D:\resors\backend; uv run pytest tests/test_auth_sessions.py` | **13 passed** — resolution returns the user, the idle slide (committed by the resolver, capped at the absolute deadline, which never moves), expiry refused without a write, disabled users refused and left for the admin flow, rotation (same family, `rotated` + `replaced_by_id`, absolute deadline inherited), the replay killing exactly its own family as `theft_detected` while the presented row keeps `rotated`, logout (204, both cookies cleared, revoked `logout`, idempotent for junk/already-ended cookies), logout-all (401 without a session; every live row of *one* user revoked `logout_all`, others untouched), and a replay through logout still killing the family |
| **CSRF tests (F029)** | `cd D:\resors\backend; uv run pytest tests/test_csrf_protection.py` | **11 passed** — the double-submit enforced whenever the session cookie is present (four refusal shapes, each changing nothing) and passing with no origin for scripted clients, the origin matrix refused even with a perfect double-submit (`https://evil.example`, `null`, scheme mismatch, lookalike host), the `Referer` fallback (and Origin winning when both are present), safe methods never checked, a latin-1 hostile header earning 403 not 500, login refusing a cross-site origin, and the carve-out: a dead session cookie does not lock the login form |
| **Password-lifecycle tests (F030)** | `cd D:\resors\backend; uv run pytest tests/test_password_change.py` | **14 passed** — wrong current password refused with nothing changed; policy evaluated with the user's own email and never echoing the candidate; new-equals-current refused; the core: rotation of the asking session (absolute deadline inherited) + every other session `password_change` + hash/flags/reset-stamp in one commit; the forced-change flag cleared; the throttle (6th attempt denied before verification, `hit_count == 6` persisted, a verified password forgiving the failures *through* a policy refusal); the reset end-to-end (policy-passing temporary, all sessions `admin`, bystander untouched, temporary signs in with the flag surfaced); and over HTTP: 204 with a fresh cookie pair, the sibling session dead, 401 without a session, 403 without the CSRF header, the wrong-current-password **422 field error (not 401) with the session still alive**, multiple policy entries on `new_password`, and the 429 with `Retry-After: 900` |
| **Authorization tests (F031)** | `cd D:\resors\backend; uv run pytest tests/test_authorization.py` | **9 passed** — `/auth/me` returns identity + sorted roles + the deduped sorted union, and stays reachable during a forced change; the superuser expansion lists every code by name with no roles; access granted by *either* of two roles against a scratch app, denied with the generic 403 (and the guarded body never runs); re-evaluation proven with `expunge_all` — the same cookie gets 403 after a DB-level revoke and 200 after re-granting, no re-login; no session → 401 everywhere; a deactivated user → 401 everywhere; and the forced-change gate: 403 with the flag detail (before the permission check), nothing executed, then the real change-password flow lifts it on the very next request |
| **Admin-permission tests (F036/F037)** | `cd D:\resors\backend; uv run pytest tests/test_admin_permissions.py` | **9 passed** — the list's guard and sorted order; mutations 401/403; create (shape refused for uppercase/missing-dot, duplicate 409, trimmed, no subset rule needed); description edits allowed on in-use codes; **in-use rename/delete both 409 with nothing moved**; unused codes rename (onto a taken code 409) and delete; 404s and the empty-edit 400 |
| **Admin-role tests (F034/F035)** | `cd D:\resors\backend; uv run pytest tests/test_admin_roles.py` | **14 passed** — the catalogue's guard and order; every mutation 401 anonymous and 403 with the generic message for a read-only caller; create (trimmed, deduplicated codes, duplicate name 409, unknown codes 422, escalation 403, within-set 201); rename + the seed-owned refusal; deletion 204 / 409-while-assigned / 403-system; and the matrix: replace-in-one-commit, **the rollback (a valid first entry stays unsaved when a later entry fails)**, per-entry 422 paths (`roles.<i>.role_id` / `.permission_codes`), the system column unchanged-only, the subset rule on both old and new sets, and saved grants appearing in the catalogue |
| **Admin-user tests (F033)** | `cd D:\resors\backend; uv run pytest tests/test_admin_users.py` | **20 passed** — 401 on all six endpoints without a session and the exact code each needs (generic 403, target untouched); generated temporary (verifies, forced change, shown once, never repeated in listings) and explicit-password policy refusals as field 422s; canonical email + 409 duplicates; unknown role ids 422; pagination/search/`%`-escape/`is_active`/sort all against the real database with exact totals; PATCH trims, canonicalises and *replaces* roles; empty edit 400; the `is_active` toggle requiring `users.deactivate`; deactivation revoking sessions (`admin`) and blocking sign-in until reactivation; soft-delete keeping the row, hiding it (404), blocking sign-in and keeping the email taken (409); self-changes limited to profile fields; superuser targets 403 for non-supers (update/delete/reset/create); last-super-admin 409 for deactivate and delete; grant-subset escalation 403 vs an in-set grant 200 (and a superuser granting the same role 201); reset returning a temporary that forces change and kills sessions; no response ever carrying `argon2`/`hashed_password` |
| **Session model tests (F025)** | `cd D:\resors\backend; uv run pytest tests/test_session_model.py tests/test_session_tokens.py` | **18 passed** — the token-hash shape and uniqueness, both deadlines and their ordering, all-or-nothing revocation over a closed vocabulary, user FK + cascade, the unique replacement chain and `SET NULL`, the family-revocation rehearsal, the `is_active` matrix, and the token/lifetime contract |
| **Password & rate-limit tests (F026)** | `cd D:\resors\backend; uv run pytest tests/test_password_hashing.py tests/test_rate_limit.py` | **34 passed** — Argon2id parameters and the no-plaintext contract (hash content, the `User` repr, message echo), every policy rule and the confirmed defaults, the generated-password properties (F027), window alignment/`Retry-After` math, the DB counter (limit, rollover, per-key budgets, `peek` without counting, `clear`), and the twelve-connection concurrency race |
| **Seed & bootstrap tests (F027)** | `cd D:\resors\backend; uv run pytest tests/test_seed.py tests/test_bootstrap_admin.py` | **28 passed** — the vocabulary's shape and descriptions, the three roles and exactly their documented grant sets, idempotent re-runs, operator edits and non-system roles surviving, the super-admin invariant being *restored* (including codes registered later), and every bootstrap refusal path — proven with a session factory that raises if it is reached, so "refused before the database" is structural |
| **Seed the roles and permissions (F027)** | `cd D:\resors\backend; uv run python -m app.seed` | first run prints `permissions created: 17`, `roles created: 3`, `grants added: 41`; a second run prints `Seed: nothing to do — roles and permissions are up to date.` (already done for `app_dev` — this is the fresh-database command, and it is safe at any time) |
| **Create the super-admin (F027)** | `cd D:\resors\backend; uv run python -m app.bootstrap_admin --generate-password` | prompts for the email (`--email` or `BOOTSTRAP_ADMIN_EMAIL` skip the prompt), prints the generated password **exactly once** — record it in `LOCAL_CREDENTIALS.md` at that moment — and creates the account with a forced first-login change. With no password source: `There is no default password.` / `Nothing was created.`, exit 2. A second run refuses: `A super-admin already exists (…)` |
| **Login smoke (F028)** | with the API running: `curl.exe -i -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"you@example.com","password":"wrong-guess"}'` | **401** + `{"detail":"Invalid email or password."}` — and the *identical* body for an email that does not exist (that is the point). With the real password (from `LOCAL_CREDENTIALS.md`): **200**, the user JSON (identity only), and two `Set-Cookie` headers — `__Host-session` (HttpOnly) and `__Host-csrf`. Every failed attempt counts: five in 15 minutes, then the next is **429** + `Retry-After` (`Too many login attempts. Try again later.`). So run the *correct* pair first if you plan to fumble; or use http://localhost:8000/docs → `POST /auth/login` → *Try it out* (the browser then keeps the cookies for `/docs` calls) |
| **Session & CSRF smoke (F029)** | step 1, with the API running and the real password: `curl.exe -s -c $env:TEMP\resors-cookies.txt -o NUL -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"you@example.com","password":"<real password>"}'`; step 2, read the CSRF value: `Select-String __Host-csrf $env:TEMP\resors-cookies.txt` (last column); step 3, **`<csrf>` = that value**: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X POST http://localhost:8000/api/v1/auth/logout -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>"` | step 3: **204**, two `Set-Cookie` lines emptying `__Host-session` and `__Host-csrf`; run step 3 again → **204** again (logout is idempotent). Without `X-CSRF-Token` → **403** `CSRF token missing or invalid.`; with `Origin: https://evil.example` → **403** `This origin is not allowed to make this request.`; `POST /api/v1/auth/logout-all` with no cookie → **401** `Not authenticated.` (curl's jar resends the Secure cookies to localhost — verified). A **rotated** cookie being presented anywhere (after F030 rotates) answers 401 *and* kills that session family as `theft_detected` — the test suite is the place to watch that, not curl |
| **`/auth/me` smoke (F031)** | with the jar from the F029 row freshly logged in: `curl.exe -s -b $env:TEMP\resors-cookies.txt http://localhost:8000/api/v1/auth/me` | **200** with identity (`id`, `email`, `full_name`, `phone`, `must_change_password`), `roles` — for the bootstrap account `["super_admin"]` — and **`permissions`**: the bootstrap account is `is_superuser`, so the list is **all 17 codes** sorted (`audit.read` … `users.update`) — the runtime expansion, no wildcard. Without the cookie: **401** `{"detail":"Not authenticated."}`. Sign in as a role-limited account (create one with F033 when it lands) and the list becomes exactly that role's union |
| **Admin-users smoke (F033)** | with the bootstrap account signed in (F029 row steps 1–2; **`<csrf>`** = the jar's `__Host-csrf`): list: `curl.exe -s -b $env:TEMP\resors-cookies.txt "http://localhost:8000/api/v1/admin/users?page_size=5"`; create: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X POST http://localhost:8000/api/v1/admin/users -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>" -d '{"email":"second@example.com","full_name":"Second Admin"}'` | list: **200** `{"items":[…],"total":1,"page":1,"page_size":5}` — the bootstrap account itself, `roles:["super_admin"]`, no hash anywhere. create: **201** with a `temporary_password` shown **once** (record it in `LOCAL_CREDENTIALS.md` at once); the new account appears in the list with `must_change_password:true`, and signing in with the temporary lands on the forced-change 403 until changed. Worth seeing the rules: `DELETE` on yourself → **403** `You cannot delete your own account.`; a weak `password` on create → **422** on `password`; a duplicate email → **409**; reset the second account (`POST /api/v1/admin/users/<id>/reset-password`, same headers) → **200**, a new temporary, and any session it had is dead |
| **Roles smoke (F035)** | with the bootstrap account signed in (F029 row steps 1–2; **`<csrf>`** = the jar's `__Host-csrf`): list: `curl.exe -s -b $env:TEMP\resors-cookies.txt http://localhost:8000/api/v1/admin/roles`; create: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X POST http://localhost:8000/api/v1/admin/roles -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>" -d '{"name":"demo-role","description":"smoke","permission_codes":["audit.read"]}'` | list: **200** — every seeded role with `permission_codes` and `is_system`. create: **201**. The rules worth seeing: an unknown code → **422** at `permission_codes`; renaming or deleting `super_admin` → **403** (`managed by the seed`); deleting an assigned role → **409** (`assigned to users` — assign one first via F033). The matrix, one call: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X PUT http://localhost:8000/api/v1/admin/roles/matrix -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>" -d '{"roles":[{"role_id":"<viewer id>","permission_codes":["reports.generate"]}]}'` → **204** and the list shows exactly that grant; adding an unknown code in a second entry → **422** and the first entry is *not* applied |
| **Password-change smoke (F030)** — the *safe* path: no state change | with the jar from the F029 row freshly logged in (steps 1–2), **`<csrf>` = the jar's `__Host-csrf`**: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X POST http://localhost:8000/api/v1/auth/change-password -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>" -d '{"current_password":"definitely-wrong","new_password":"a brand new passphrase"}'` | **422** with `detail: [{"type":"value_error","loc":["body","current_password"],"msg":"Current password is incorrect."}]` — field-addressable, no `input`, and the session survives (the next command still works). Drop `X-CSRF-Token` → **403**; a `new_password` of `password123` (with the *correct* current one — this one does verify) → **422** with two entries on `new_password` (too short + common list) and nothing changed. Five wrong current passwords → the sixth is **429** + `Retry-After`. A **real** change (correct current + policy-passing new) answers **204** + a fresh cookie pair and invalidates every other session — if you smoke that, pick the new password deliberately and immediately update `LOCAL_CREDENTIALS.md`, because login will demand it from then on |
| Backend lint and types (F023) | `cd D:\resors\backend; uv run ruff check .; uv run ruff format --check .; uv run mypy app migrations` | clean. The CI gate that *enforces* this is F056's; these commands work today |
| **Renders, not just compiles (F018 fix; updated by F032)** | with the dev server running: `& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --user-data-dir=$env:TEMP\chrome-smoke --virtual-time-budget=9000 --enable-logging=stderr --dump-dom http://localhost:5173/` | with no session, the DOM is the **login card** — `<h1>Sign in</h1>`, the email/password inputs, the theme toggle (the shell is behind the session boundary now; the sidebar + `Dashboard` appear once signed in). Add `2>&1 \| Select-String "CONSOLE"` to see console output; an empty `<div id="root">` or a `CONSOLE` line naming a module means the app did not start — this is the check that catches circular-import crashes, which typecheck/tests/build all miss. If the card never appears and `CONSOLE` shows a failed `/api/v1/auth/me` fetch, check the backend is running — that request is the first thing the app makes |
| **Regenerate the API types (F018)** | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | `wrote …\backend\openapi.json`, then `✓ …\generated\api · 2 files`; **both committed artefacts must come back unchanged** — `git -C D:\resors status --short backend/openapi.json frontend/src/lib/generated` prints nothing. That is exactly F061's drift check |
| **Normalise generated UI (F014)** | `cd D:\resors\frontend; pnpm run fix:ui` | restores reverted components, remaps `cn`, strips `"use client"`, removes reinstated dependencies (run after every `shadcn add`) |
| **Matrix UI tests (F036)** | `cd D:\resors\frontend; pnpm exec vitest run tests/admin/roles.test.tsx` | **13 passed** — the grid renders from the dictionary (namespace groups, codes, descriptions) with ticks matching the catalogue; the seed column is read-only (aria-disabled + lock, menu items disabled); a tick is unsaved state with **zero requests**, one Save puts the whole matrix (protected unchanged) and re-reads the catalogue; Reset and untick-to-clean both clear the bar; the 422's entry message shows in the bar with the draft intact; the rule 403 the same; navigation with a dirty draft hits the discard confirm; create/duplicate-conflict/rename/delete flows |
| **Permissions smoke (F037)** | with the bootstrap account signed in (F029 row steps 1–2; **`<csrf>`** = the jar's `__Host-csrf`): create: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X POST http://localhost:8000/api/v1/admin/permissions -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>" -d '{"code":"reports.export","description":"Export reports."}'` | **201**; the list (`GET /api/v1/admin/permissions`) shows it sorted. The guardrails worth seeing: the same create again → **409**; `"Users.Read"` → **422** on `code` (never normalised); `DELETE` on a seeded code (e.g. `users.read`, which `super_admin` holds) → **409** `cannot be renamed or deleted`; on the just-created unused code → **204** |
| **Settings UI tests (F040)** | `cd D:\resors\frontend; pnpm exec vitest run tests/admin/settings.test.tsx` | **6 passed** — the form seeds from the snapshot (persisted values + defaults), re-seeds from the save response, refuses a too-short name locally with **no request**, maps the server's timezone 422 onto the field named after the registry key, sends one bare-map PUT with all four keys, and renders read-only without `settings.manage` |
| **Settings tests (F039)** | `cd D:\resors\backend; uv run pytest tests/test_admin_settings.py` | **8 passed** — guards (401/403, read-only callers can read); the snapshot serves registry defaults with zero rows; a failed payload (unknown key, bad format, wrong JSON type) writes **nothing**; overrides stored trimmed with `updated_by`; partial updates leave other overrides alone; `updated_by` → NULL when the author is deleted; and the two restart proofs (expunge-and-reread through the API; write-close-reopen on its own connection) |
| **Profile & preferences tests (F041)** | `cd D:\resors\backend; uv run pytest tests/test_profile_api.py` | **8 passed** — the gating split (only `GET /auth/me` survives a forced change); PATCH me trims, clears the phone with null, 400s an empty edit and **422s an email attempt** (extra=forbid); preference CRUD round-trips, upserts one row, deletes idempotently; key shapes and null/oversized values refused; **the acceptance: two users share one key and never see or touch each other's rows**; deleting a user cascades their preferences |
| **Permissions UI tests (F038)** | `cd D:\resors\frontend; pnpm exec vitest run tests/admin/permissions.test.tsx` | **9 passed** — the table renders and sorts/searches in the browser; no management controls without `permissions.manage`; create posts the dialog and closes; a malformed code is refused locally with **no request**; server 422/409 refusals render in the right surfaces (field, dialog root alert, confirmation-then-toast) with the draft intact |
| **Settings smoke (F039)** | with the bootstrap account signed in (F029 row steps 1–2; **`<csrf>`** = the jar's `__Host-csrf`): read: `curl.exe -s -b $env:TEMP\resors-cookies.txt http://localhost:8000/api/v1/admin/settings`; write: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X PUT http://localhost:8000/api/v1/admin/settings -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>" -d '{"branding.app_name":"Resors","display.date_format":"YYYY-MM-DD"}'` | read: **200** with all four registry keys at their defaults. write: **200** echoing the fresh snapshot; re-read returns the new values — and they **survive an API restart** (stop/start uvicorn; the row is in PostgreSQL). Refusals: `{"nope.key":"x"}` → **422** at `nope.key`; `{"display.date_format":"31/12/2026"}` → **422** at that key |
| **Profile & preferences smoke (F041)** | with the bootstrap jar (same `<csrf>`): profile: `curl.exe -i -b $env:TEMP\resors-cookies.txt -X PATCH http://localhost:8000/api/v1/auth/me -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -H "X-CSRF-Token: <csrf>" -d '{"full_name":"Renamed Operator"}'`; preferences: `... -X PUT http://localhost:8000/api/v1/auth/me/preferences/table.rows ... -d '{"value":25}'` | PATCH: **200** with the full MeResponse (identity + roles + permissions); `{"email":"x@y.z"}` → **422** (`extra_forbidden`); `{}` → **400**. PUT → **200** `{"key":"table.rows","value":25}`; `GET /api/v1/auth/me/preferences` lists it; `DELETE` → **204** and again → **204**; `PUT .../BadKey` → **422** at the path key |
| Frontend coverage | `cd D:\resors\frontend; pnpm run coverage` | prints the v8 report — **472 tests passing**, ~89% statements overall. The threshold gate is F055/F061's; corrected in F015 because the old "100%" claim overstated what this run prints |
| **Frontend auth-flow tests (F032)** | `cd D:\resors\frontend; pnpm exec vitest run tests/auth/auth-flows.test.tsx` | **14 passed** — the session boundary (anonymous redirect with intended-path return; network failure → Retry, **not** login), sign-in failures shown verbatim, local validation without a request, the forced-change landing/bounce/completion with the CSRF header asserted on the wire, 422 field mapping, mismatch refusal, both sign-out flows, the registered 401 re-resolution (one retry), and `readCsrfToken` |
| API liveness (F007) | `curl http://localhost:8000/api/v1/health` | `{"status":"ok","name":"Application Platform",...}` |
| **Layout shell (F015)** | open the app, then narrow the window (or use devtools device mode) through **1440px → 900px → 390px** | 1440: 260px sidebar + 64px header. 900: the sidebar starts as the 64px icon rail. 390: no pinned sidebar; a hamburger opens the 260px drawer (Escape closes it) |
| **Sidebar preference (F015)** | click the round chevron on the sidebar edge, then press **F5** | it stays collapsed after reload; console: `localStorage.getItem('app.sidebar')` → `"collapsed"` |
| **Nav behaviour (F015)** | inside the collapsed rail, hover the **Dashboard** row; click the **Overview** group label | the label appears as a tooltip in the rail; the group collapses/expands and the choice survives **F5** (`app.sidebar.groups`) |
| **Context slot is off (F015)** | look at the header on desktop | **no** context selector is rendered — the slot is disabled by default (BIG-PROMPT §3.2a); it appears only when a module injects an enabled adapter |
| **Command palette (F016)** | press **Ctrl+K** (or Cmd+K), or click the **Search anything** box in the header | the palette opens listing `Overview → Dashboard`; typing filters; **Enter** jumps to the highlighted page; **Escape** closes and focus returns to where it was |
| **Route states (F017; updated by F032/F034)** | **signed in**, visit **`/`**, **`/admin`**, **`/nonexistent`**, **`/403`**, **`/404`** in turn (anonymous, every one of these lands on `/login` with the path remembered — that is F032's boundary working) | `/` lands on `/dashboard` — the protected placeholder, which says plainly that the real screen is F047; **`/admin` now redirects to `/admin/users`** when the caller holds `users.read` (F034 registered the first administration route) and shows the **403** page otherwise; any unknown path shows **404 inside the shell** (navigation still usable); `/403` and `/404` render those pages directly |
| **Nav filtering (F016)** | compare the sidebar with the palette, and inspect the registry in `docs/ROUTES_NAVIGATION.md` §2 | both list exactly the registered pages — **Dashboard**, plus **Users** (`users.read`), **Roles** (`roles.read`) and **Permissions** (`permissions.read`) for callers holding those codes (the Administration group appears for them, and only them: absent, not empty, for everyone else). The remaining administration pages arrive in F038–F044; an anonymous visitor never reaches the shell at all (F032 sends them to `/login`) |
| **Admin users screen smoke (F034)** | open http://localhost:5173, sign in with the bootstrap account, and look for the **Users** entry under Administration | the sidebar gains **Administration → Users**; the table lists accounts with role badges, status and created date; typing in search updates the URL-less query (watch the network tab: `search=…`); the **Status** select sends `is_active=false`; clicking a column header sends `sort`/`order`; **Add user** opens the dialog — create one and the **temporary password appears once** with a Copy button (record it, then sign in with it to see the forced-change flow); the row menu offers Edit / Reset password / Activate–Deactivate / Delete, each behind its confirmation where destructive — and on **your own row** Deactivate/Delete are disabled (the server would refuse them, C22) |
| **Auth smoke (F032)** — the full round trip | backend + frontend running; open http://localhost:5173 in a browser | anonymous → the **Sign in** card (no shell). Sign in with the bootstrap account (`LOCAL_CREDENTIALS.md`): it has `must_change_password=true`, so the app lands on **Choose a new password** — try `/dashboard` and get bounced back; complete the change (**204**, cookies rotate) and the dashboard appears with your name in the header menu. Open the account menu: **Sign out** → login card; sign in again with the **new** password (update `LOCAL_CREDENTIALS.md` the moment you change it). Wrong password shows `Invalid email or password.`; five wrong ones → the 429 sentence. **Sign out everywhere…** asks for confirmation, then ends every session |
| **Typed client, end to end (F018)** | with the backend running, open http://localhost:5173 and paste into the devtools console: `const { api } = await import('/src/lib/api.ts'); await api.get('/api/v1/health')` | the health JSON straight from FastAPI (`{"status":"ok","name":"Application Platform",…}`) — the SPA reached the API through the Vite proxy with the generated types. Then `await api.get('/api/v1/nope').catch(e => e.detail)` → **`The requested item was not found.`** — the normalised `ApiError`, not an Axios error. The app itself now makes exactly **one** API call on load — `GET /api/v1/auth/me` (F032; watch it in the network tab) — and no page fabricates data; F047's dashboard is the first real data consumer |
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
