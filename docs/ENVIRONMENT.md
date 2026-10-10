# Environment facts (archival snapshot)

> **Archival snapshot.** This file preserves verbatim §4 ("Environment facts") of `NEXT_PROMPT.md` as it stood
> before the documentation optimisation. It is kept for reference.
>
> - Some environment facts here may be **outdated**; they were accurate when recorded and have not been corrected.
> - **Current versions must be verified against the actual project configuration files** (`frontend/package.json`,
>   `backend/pyproject.toml`, `backend/uv.lock`, `frontend/pnpm-lock.yaml`, `docker-compose.yml`, and the
>   `docs/STACK_VERSIONS.md` record), not taken from this snapshot.
> - Historical implementation details (task IDs, test counts, decision references) are preserved for reference
>   and do not describe the current state of the repository.

---

## 4. Environment facts

- Windows 11; PowerShell-first, Bash (Git Bash/MSYS2) also available. Node **v24.14.0**, pnpm **12.9.1**
  (pinned in `package.json`, honoured — no corepack switch), `uv`, git 2.49, Python 3.14. Docker not yet verified.
- Both sides are installed: `frontend/node_modules` (pnpm) and `backend/.venv` (`uv sync`, 64 packages locked).
  Neither dev server is running by default; the database container is running now.
- **Styling is live:** `frontend/src/styles/globals.css` holds the theme tokens (31 light / 30 dark, values
  verified against the reference). Tailwind 4 goes through `@tailwindcss/vite`; dark mode is the `.dark` class
  on `<html>`, not a media query — F010 supplies the provider that sets it.
- **UI primitives and tests are live:** all **29 of the source's primitives** are present in
  `frontend/src/components/ui/` — the last one, `table`, arrived with F020, and `date-picker` and
  `time-picker` are two of those 29, not extras — plus `calendar` (F014, hand-written: not a registry
  item) and `sonner` (F018), so the directory holds **31 files**. With the
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
- **The header's controls are all real now (F046).** CLAUDE_MASTER forbids inert buttons; the last
  withheld control — the notification bell — arrived with F046
  (`components/layout/notification-bell.tsx`: polls `unread-count` every ~30 s via `refetchInterval`,
  pauses while the tab is hidden by the default `refetchIntervalInBackground: false`, and renders
  only for a signed-in caller holding `notifications.read`).
- **The inbox is live (F045):** `notifications` (**migration `0008`**, applied to `app_dev`) —
  per-user rows (title, message, optional `link`, `is_read`, `ON DELETE CASCADE`). Six endpoints
  under `/api/v1/notifications` (C34): list (F033 shape — `page`/`page_size` ≤100, newest-first
  with an `id` tiebreaker, `{items, total, unread_count, page, page_size}` so the bell and the
  page are one request), `GET /unread-count` (the F046 bell poll), `POST /{id}/read` (200 item),
  `POST /read-all` (`{updated}`), `DELETE /{id}` (204; repeat → 404), `DELETE ""` (clear all,
  `{deleted}`). **Producers** call `services/notifications.py::notify` — adds to the caller's
  transaction, never commits; **no create endpoint exists by design** (a spam relay for one's own
  inbox). **Links are internal paths** (`^/[A-Za-z0-9]`, ≤ 500 — at the door and in the table's
  CHECK; `//host`, `/\host`, percent-decode tricks refused). **Cross-user denial is the
  `(id AND user_id)` SQL filter** — foreign ids answer 404, never 403; no user-id parameter
  exists. **No audit rows** for inbox operations (not administrative mutations). **One producer
  wired**: the admin password reset notifies its target inside the reset's transaction.
  **Tests:** +9 in `tests/test_notifications.py` (**245 backend**); frontend untouched (**485**);
  `openapi.json` + generated types regenerated.
- **The inbox UI is live (F046):** `/notifications` (Overview group, `notifications.read`; visible in
  the sidebar/palette) — the source's list pattern (narrow centered column, unread pill beside the
  title, mark-all, **confirmed** clear-all via F019's `ConfirmDialog`, unread left accent, relative
  timestamps via `Intl.RelativeTimeFormat`, per-item delete with a height-collapse exit, All/
  Unread/Read tabs, empty/loading/error states). **C35:** the tabs are **server parameters** (F045's
  list gained `is_read`; page + `total` in SQL) while the pill is the account's global unread — the
  pill and the header bell badge read the **same `unreadCount` query key** (`queryKeys.notifications.*`,
  user-scoped). All mutations are optimistic with rollback (`hooks/use-notifications.ts`); a card's
  link renders **through the router**. The bell polls `unread-count` every ~30 s and pauses on a
  hidden tab; without `notifications.read` it renders nothing and the route 403s. `PageHeader.title`
  now takes a node. **Tests:** +13 in `tests/notifications/notifications.test.tsx` (**498 frontend**),
  +1 backend filter test (**246**); `openapi.json` + generated types regenerated. A latent cold-cache
  race in F040's settings test (assertion before seed) was found and made deterministic.
- **The audit viewer is live (F044):** `GET /api/v1/admin/audit` (`audit.read`) — fixed newest-first
  order with an id tiebreaker; filters `action`/`entity_type` (validated against the vocabularies; a
  422 names the allowed set), escaped `search` (summary + actor email), `since`/`until`; the response
  carries the vocabularies themselves (select options from the server, no client drift); items carry
  `details` + `correlation_id` (no detail endpoint needed). The `/admin/audit` screen (FileText icon)
  renders nothing mutable; the detail modal shows before/after diffs, the `changes` shape or JSON,
  and the correlation id. **Tests:** +6 backend (**236**), +5 frontend in
  `tests/admin/audit.test.tsx` (**485**).
- **The audit trail is live (F043):** `audit_logs` (**migration `0007`**) — append-only (`created_at`
  only; no update path), **atomic with its mutation** (`record` adds to the caller's session and never
  commits; failures roll the event back — both directions tested), frozen attribution (`user_id` SET
  NULL + `actor_email` snapshot), **door-level redaction** (credential-shaped keys refused recursively;
  one event per matrix/settings save; key-only preference events; reset events without the temporary).
  `X-Request-Id` middleware: validated-or-generated, echoed on every response, stored as
  `correlation_id` (NULL outside requests). Backfill across all admin/self services, behaviour
  unchanged. **Tests:** 10 new in `tests/test_audit.py`, `uv run pytest` is now **230 passed**.
- **The profile pages are live (F042):** `/profile` (Details: editable name/phone seeded from the
  session, save → PATCH + `auth.refresh()` so the header follows; email read-only; member-since
  `created_at`; roles badges; Active-by-construction) + Security CTA + **view-only permissions
  grouped by namespace**; `/profile/security` reuses the extracted **`ChangePasswordForm`** (the
  standalone forced-flow page unchanged). Both `showInNavigation: false`; reached via the account
  menu (Profile wired, Change password → `/profile/security`); the forced-change redirect outranks
  them (tested). `MeResponse.created_at` added. **Tests:** 8 new, `pnpm exec vitest run` is now
  **480 passed**; backend 220.
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

