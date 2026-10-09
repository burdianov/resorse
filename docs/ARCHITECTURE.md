# ARCHITECTURE — task F004

Decisions for the SPA/API split, the session model, and the extension boundaries that let Stage B (construction
manpower) be added without rewriting the foundation. Sources: `BIG-PROMPT.txt` §6, §8, §9, §12 (Phase 0);
`PRODUCT_SPEC.md` §2; `docs/STACK_VERSIONS.md`; `docs/REQUIREMENT_TRACEABILITY.md`.

**Scope:** Stage A foundation only. No construction-domain table, route or interface appears here.

## 1. System context

```text
   Browser (React 19 SPA)
  ┌──────────────────────────────┐
  │  Vite build: static JS/CSS   │
  │  React Router 8 (SPA mode)   │
  │  TanStack Query → Axios      │
  └───────────────┬──────────────┘
                  │  HTTPS, first-party cookies, no CORS
  ┌───────────────▼──────────────────────────────────────────────┐
  │  Caddy  (production edge)                                     │
  │    /            → static Vite files                           │
  │    /api/v1/*    → backend:8000                                │
  │    /*           → index.html      (SPA fallback, NOT for API) │
  │    TLS, HSTS, CSP, body limits                                │
  └───────────────┬──────────────────────────────────────────────┘
                  │  internal Docker network (not published)
  ┌───────────────▼──────────────┐        ┌──────────────────────┐
  │  FastAPI + uvicorn           │───────►│  PostgreSQL 18.6     │
  │  /api/v1, async SQLAlchemy 2 │        │  durable state only  │
  │  Alembic migrations          │        └──────────────────────┘
  └───────┬──────────────┬───────┘
          │              │
   ┌──────▼─────┐  ┌─────▼────────┐
   │ private    │  │  Gotenberg   │  DOCX → PDF (internal only)
   │ uploads    │  └──────────────┘
   └────────────┘
```

No Redis anywhere. No Next.js runtime. No public database or converter port.

## 2. Runtime topology — development vs production

| | Development | Production |
|---|---|---|
| Frontend | Vite dev server `:5173`, proxies `/api` to the backend | Static build served by Caddy |
| Backend | `uvicorn` `:8000`, hot reload | `uvicorn` in a container, non-root, **not published** |
| Edge | none — Vite proxy | Caddy `:443`, TLS, security headers, SPA fallback |
| PostgreSQL | `docker compose up -d` → `:5432` (dev only) | internal network only, persistent volume |
| Gotenberg | `docker compose up -d` → `:3100` host | internal network only |

**Same-origin by design.** The API is reached at relative `/api/v1` in both environments, so cookies are
first-party, `SameSite` behaves predictably, and no CORS preflight exists in the normal path
(`BIG-PROMPT` §6.2d, §9.3, §11.2). `VITE_API_URL` exists only as an escape hatch and must not carry secrets.

## 3. Session and authentication model — the binding decision

**Chosen: opaque rotating session cookies, server-side rows in PostgreSQL.** No JWT, no refresh token, no token
in JavaScript.

`BIG-PROMPT` §6.2 permits either this or "short access token + HttpOnly rotating refresh cookie"; it explicitly
forbids reproducing the source's `localStorage` JWTs, and `PRODUCT_SPEC.md` lists the opaque design first. It
wins on simplicity and blast radius:

- **Nothing secret is reachable from JavaScript.** An XSS bug cannot exfiltrate a bearer token, because the
  browser never exposes one to script.
- **Revocation is a row update** — the pack requires instant effect for account deactivation, password reset,
  role changes and logout-all. With access tokens those require `token_version` bumping plus a grace window.
- **No refresh endpoint**, so the refresh-reuse-detection machinery and the client's single-flight refresh
  interceptor disappear. Fewer moving parts, fewer ways to be wrong.

### Session mechanics

| Property | Decision |
|---|---|
| Cookie | `__Host-session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain` (the `__Host-` prefix enforces this) |
| Secret | 256-bit random session ID; only its **SHA-256 hash** is stored. Raw value never logged or persisted. |
| Rotation | New ID issued on login, on password change/reset, on any change to the user's roles, and on privilege escalation |
| Theft detection | Presenting a **superseded** session ID (rotation replay) revokes the whole session family and records an audit event |
| Idle timeout | initial default 12 h, refreshed on activity — configurable, confirmed at F025 |
| Absolute lifetime | initial default 30 days regardless of activity — configurable, confirmed at F025 |
| Multiple sessions | allowed; each row is independently revocable (`logout-all` = revoke all rows for the user) |
| Re-evaluation | every request resolves the user **and** effective permissions from the DB, so a role change applies on the next request without stale privilege |
| CSRF | `SameSite=Lax` **plus** mandatory `Origin`/`Referer` validation on unsafe methods **plus** a double-submit `X-CSRF-Token` header (token issued as a readable companion cookie at login) |
| Audit | session created / rotated / revoked / theft-detected are audited events |

Cost: one indexed lookup per request. Acceptable for a single-company internal application; a process-local
micro-cache is permitted later (`BIG-PROMPT` §0.6 allows process-local caches for disposable optimisation) but
is explicitly **not** part of this design.

### Consequences to carry into dependent tasks

Choosing opaque sessions removes three things the requirements assumed. None is silently dropped:

| Requirement | Status under this design | Owning task |
|---|---|---|
| `POST /api/v1/auth/refresh` (§8.3 endpoint list) | **Not implemented — no such concept.** §8.3 permits evolving endpoints when justified; refresh is absent because there is no token to refresh. Session lifetime is extended server-side instead. | F028, F029 |
| §6.2e single-flight refresh interceptor | **Not needed.** The Axios client retries once on a `401` after re-resolving auth state, with no refresh call and no cross-tab coordination. | F018, F032 |
| F029 "rotation reuse detection" | **Reinterpreted**: reuse detection applies to a rotated session ID being presented again (family revoked) rather than to refresh-token families. The task's other halves — logout, CSRF policy — stand unchanged. | F029 |

`DECISIONS.md` **C12** records this choice. If the operator prefers the access + refresh token design instead,
it must be changed *before* F025, because the session table's shape differs.

### Rejected alternative — access + refresh JWT

Keeps §8.3's endpoint list verbatim, but: puts a bearer credential in JS memory for the life of every request,
requires `token_version` invalidation for every role change, requires rotation/reuse-detection/family tracking,
and requires the client's single-flight refresh interceptor. Strictly more code and more failure modes for no
capability this application needs.

## 4. Backend structure and request lifecycle

```text
backend/app/
  main.py                 app assembly, lifespan, middleware, exception handlers
  api/v1/                 routers only — no business logic
    router.py             aggregates; auth, admin_users, roles, permissions,
                          settings, preferences, notifications, audit, files,
                          reports, health
  core/                   config, database, deps, security, logging, errors,
                          permissions, rate_limit
  models/                 SQLAlchemy 2 declarative models (no domain tables)
  schemas/                Pydantic 2 request/response DTOs
  services/               transactional business logic
  seed.py, bootstrap_admin.py
migrations/               Alembic
```

**Request lifecycle:** `Caddy` → router (auth dependency resolves session → user → effective permission set) →
Pydantic DTO validation → service function inside an explicit transaction → SQLAlchemy → response DTO. Domain
exceptions map to a single error shape with `detail`; nothing leaks a stack trace in production; every request
carries a request ID that appears in logs and in `audit_logs.correlation_id`.

**Authorization is enforced in `deps` and in SQL**, never by the router alone and never only in the UI.

## 5. Frontend structure and data flow

```text
frontend/src/
  main.tsx  App.tsx
  app/            router.tsx, providers.tsx
  styles/         globals.css (Tailwind 4 tokens)
  config/         navigation.ts, access.ts (leaf access model), permissions.ts, branding.ts
  components/form/  form.tsx (pattern), fields.tsx, form-actions, form-errors, unsaved-changes-guard
  components/     ui/ (29 primitives), layout/, data-table/, form/, loaders/, common/, providers/
  features/       <feature>/{api,hooks,schemas,components}   — auth, admin/*, profile, notifications, reports
  pages/          route components
  hooks/  lib/  testing/
```

**Data flow:** page → feature hook (`useQuery`/`useMutation`) → typed API module → shared Axios instance →
relative `/api/v1`. Query keys are centralised and identity-scoped; caches are cleared on logout and on identity
change. Server state lives in TanStack Query; form state in React Hook Form + Zod; nothing duplicates server
state into a global store.

**Routing mode (decided, F006): data-router mode** — `createBrowserRouter` with route objects, not the
declarative `<Routes>` form. §2.1 requires one documented mode. Route objects carry the per-route metadata the
registry needs (`requiredPermissions`, `adminOnly`, lazy component, error element), give each route its own
error boundary, and support `loader`/`action` later without a restructure. No framework/SSR mode: this is a
client-only SPA.

**Component library workflow (established in F011).** Primitives are generated with the registry rather than
hand-written, then corrected:

```bash
cd frontend
pnpm dlx shadcn@4.21.4 add <component> --yes --overwrite
pnpm run fix:ui            # scripts/fix-generated-ui.sh — see below
pnpm run typecheck && pnpm run test:run
```

`pnpm run fix:ui` performs the four corrections in one pass. It restores tracked components from `HEAD`, so
**commit before generating** — uncommitted work in `src/components/ui` will otherwise be lost with the
generator's own rewrite.

Corrections to the generated output, all required by the pack:

1. **`cn` import remap.** `base-nova` items import a helper from the `cn` package. §2.1 names `clsx` +
   `tailwind-merge`, and the reference carries `lib/utils.ts`, so `src/lib/utils.ts` exports our own `cn` and the
   import is rewritten. Skipping this leaves an undeclared dependency.
2. **`"use client"` removed.** A Next.js directive with no meaning in a Vite SPA (§0.5).
3. **`shadcn/tailwind.css` is not imported**, and the `shadcn` CLI is not a project dependency. F009 predicted
   the primitives would need it; F011 showed they do not — the generated components use only standard Tailwind
   utilities plus our tokens, and render correctly without it. Add it only if a future component demonstrably
   needs it.

4. **`--overwrite` reverts other components.** Registry items declare dependencies on each other (`dropdown-menu`,
   `dialog`, `sheet`, `select` and `calendar` all pull in `button`, `input`, `textarea` …), so adding one component
   regenerates those and **silently undoes local changes to them**. F013 lost Button's `loading` prop this way, and
   F014 lost five files at once. `pnpm run fix:ui` restores them from `HEAD`; commit before generating so `HEAD` is
   the correct version.

5. **It reinstates dependencies the project rejected.** The `sonner` item (F018) added `next-themes` back — the
   package F010 replaced with our own provider — because the generated component imports its `useTheme`. The
   corrected component is tracked (so step 1 restores it), but the dependency entry is written fresh each time, so
   `fix:ui`'s step 5 removes it. Expect this for any component whose registry item reaches for a Next.js-era
   package; check the dependency diff after every generation, not just the file diff.

Anything else the generator emits that conflicts with the spec — a Next API, a hard-coded colour, a missing
state — is fixed in place with a comment explaining why, as with Button's `loading` prop (§5.2 requires it).

**Theme provider (decided, F010): our own, not `next-themes`.** §2.1 permits `next-themes` only if verified to
work in a Vite SPA, otherwise requires "an equally small framework-agnostic theme provider" and a documented
exception. This is that exception, recorded here and in `docs/STACK_VERSIONS.md`:

- `next-themes` exists to bridge Next.js's server/client theme split. This is a client-only SPA with no SSR and
  no hydration, so the problem reduces to reading a stored value, resolving `system` against
  `prefers-color-scheme`, and toggling `.dark` on `<html>`.
- The provider is ~60 lines with no dependency, and it keeps the anti-flash script in our own control —
  a party we must reason about for the first-paint guarantee anyway.
- **Storage split:** the *local* `localStorage` value is the first-paint source (it must be available before any
  network call). §7.6 also lists the theme choice as a server-side `user_preferences` entry; reconciling the two
  is **F048's** job, at which point the local value stays authoritative for first paint and the server value syncs
  after sign-in.
- The anti-flash script in `index.html` duplicates the key and the resolution rule deliberately — it must run
  before any module loads. Both copies carry a comment pointing at each other.

## 6. Authorization model

- **Roles and permissions are many-to-many.** Effective permissions = union of the user's roles' permissions,
  with explicit super-admin handling. A user may hold several roles.
- **Permission codes are machine-stable and server-registered**, namespaced `resource.action`:
  `users.read|create|update|deactivate|reset_password`, `roles.read|manage`, `permissions.read|manage`,
  `settings.read|manage`, `audit.read`, `notifications.read|manage_own`, `files.read|create`,
  `reports.generate`. The frontend consumes the registry; it never invents entries.
- **Three enforcement layers, only one of which is security:**
  1. `require_permission(...)` dependency in the API — *the boundary*;
  2. SQL-level scoping in the query itself — *the boundary for row ownership*;
  3. `PermissionGate` / navigation visibility in the SPA — **UX only**, never load-bearing.
- **Fail closed.** Missing/unknown permission, inactive user, deleted user, expired or superseded session → deny.

## 7. Extension boundaries (the reason this is a foundation)

Stage B adds construction modules against these interfaces; the foundation must not need rewriting. Interfaces
are illustrative in shape but binding in intent.

```ts
// frontend/src/config/modules.ts — a future module registers itself here
interface AppModule {
  id: string;
  navigation?: NavGroup[];          // rendered through the same registry as the built-in groups
  routes: RouteConfig[];            // same metadata contract as config/navigation.ts
  permissions?: PermissionDefinition[];  // declared here, registered server-side
  featureFlag?: string;
}
```

```python
# backend/app/core/permissions.py — scope policy for future project/business-unit isolation
class ScopePolicy(Protocol[TResource]):
    def can_access(self, user: AuthenticatedUser, action: str, resource: TResource) -> bool: ...
```

```ts
// frontend/src/components/layout/context-switcher-slot.tsx (F015)
interface ContextSwitcherAdapter<TContext> {
  enabled: boolean;                              // false by default; no inert selector is rendered
  listAvailable(): Promise<TContext[]>;
  getSelected(): TContext | null;
  select(context: TContext): Promise<void> | void;
}
```

Rules that make these boundaries real:

- **No runtime plugin loading of remote code.** Modules are compiled in; there is no dynamic loader.
- **Permissions are registered server-side.** A frontend module cannot grant itself authority.
- **The navigation registry is single-source**: sidebar, command palette, breadcrumbs and route guards all read
  the same permission-filtered definition (F016).
- **The extension contract is proven by a test-only module** in F063 — one route, nav item, permission, model,
  migration and endpoint, then removed from production — per §12 Phase 7.
- **Rates and personal data stay least-privilege** when Stage B arrives; `ScopePolicy` is where project scoping
  lands, and membership is always verified server-side.

## 8. Data model (foundation only)

```text
users ──< user_roles >── roles ──< role_permissions >── permissions
  │                       
  ├──< sessions                 (hashed id, family, expiry, revoked_at, replaced_by)
  ├──< user_preferences         (unique user_id + key, JSONB value)
  └──< notifications            (title, message, safe internal link, is_read)

audit_logs        (immutable; actor, action, entity, sanitized diff, correlation_id)
app_settings      (typed allowlist registry, updated_by)
file_assets       (UUID key, MIME, size, sha256, owner)
login_attempts / rate_limit_buckets   (DB-backed throttling; no Redis)
```

Every table: UUID primary keys, `timestamptz` UTC instants, explicit constraints and indexes. Money as
`NUMERIC`/`Decimal` when Stage B introduces it. Cross-user isolation is enforced in SQL, not by filtering
unrestricted rows in Python. **No domain table is created in Stage A.**

## 9. Migration strategy

- Alembic, async engine; one migration per schema change; **never** schema changes at application startup.
- Every migration must apply to an **empty** database; downgrade where feasible; no drift on repeat.
- The initial migration creates only the domain-neutral schema above. Historical QTC360 migrations are never
  imported.
- Destructive changes use expand → migrate → contract, so a rollback is always available during a release.

## 10. API contract

- Versioned prefix `/api/v1`; OpenAPI generated by FastAPI and used as the source for a typed frontend client
  (DTOs generated in F018, drift-checked in CI at F061; documented in `docs/OPENAPI_CLIENT.md`).
- Consistent error shape `{ "detail": ... }` with deliberate `200/201/204/400/401/403/404/409/422/429`
  semantics. Validation errors are field-addressable so forms can map them onto inputs.
- Health vs readiness are separate: `/health` is liveness; `/ready` additionally checks PostgreSQL (and
  Gotenberg where reports are required) and is not public.
- Pagination is keyset-or-offset **with a total**, and the UI never disagrees with the server's count.

## 11. Consequence of the session choice for the task list

Two entries are affected. Neither is blocked; both change meaning:

- **F025** builds the `sessions` table (not `refresh_tokens`).
- **F029** covers session rotation, rotated-ID replay detection, logout/logout-all and CSRF policy (not
  refresh-token rotation). Its title still reads "Auth refresh logout"; the operator may want to amend that line,
  the same way C11 amended the package manager.

## 12. Implementation notes

Practices learned during F011–F014. They live here rather than in commit messages because each one cost real
time to rediscover, and every one of them will recur.

### Verify against the artefact, not against your expectation of it

Checking output with a hand-written matcher produced **more false failures than real ones** in F009–F014. Three
separate times the code was correct and the check was wrong:

- the minifier rewrites `oklch(0.13 0 0)` as `oklch(13% 0 0)` and strips leading zeros (`0.243` → `.243`);
- it normalises every string literal to **backticks**, so `js.includes('"light"')` is false while `` js.includes(`light`) `` is true;
- an attribute asserted as `data-orientation` was actually `orientation`, and a label asserted as `Breadcrumb` was
  actually `breadcrumb`.

Normalise before comparing, and prefer `includes` on the raw substring over assuming a quoting or format
convention.

### When a check fails, inspect the real output before changing code

The second recurring lesson. In F011–F014 most failing tests were **wrong expectations, not defects**: `onSelect`
(Radix) where Base UI uses `onClick`; Tabs using manual activation, where arrows move focus and Enter selects;
`aria-hidden` applied to a container rather than the control; `DropdownMenuLabel` requiring a `DropdownMenuGroup`
ancestor; cmdk highlighting the first match immediately. Each time, dumping the actual DOM settled it in one step
after several steps of guessing. Dump first.

### Test isolation for overlays

Base UI modals apply document-level state while open — focus trap, `aria-hidden` on siblings, a nested-dialog
counter. `cleanup()` unmounts the React tree without running the close path, so that state leaks into the next test
and the following modal never receives focus: a test that passes alone and fails in sequence. `src/testing/setup.ts`
presses Escape before `cleanup()` for this reason.

### jsdom gaps

jsdom has no layout, so these are absent and must be shimmed (`src/testing/setup.ts`): `matchMedia`,
`ResizeObserver`, `scrollIntoView` (cmdk calls it on highlight — without it every Command test fails on mount), and
the pointer-capture methods Base UI's overlays use. A surprising number of "component bugs" are one of these.

### `exactOptionalPropertyTypes` and third-party props

The flag (on since F006) rejects an explicit `undefined` for an optional property, which third-party component
props routinely produce. Spread conditionally rather than relaxing the flag:

```tsx
<CalendarDayButton {...props} {...(locale ? { locale } : {})} />
```

### Generating UI components

See §5. The rule that matters most: **commit before running the generator**, then `pnpm run fix:ui`. The generator
reverts components it considers dependencies, and `HEAD` is what `fix:ui` restores from — F013 and F014 each lost
work to this.

### Adapting a generated primitive — the sidebar (F015)

Beyond the standard pass, the registry's `sidebar` needed four corrections; the header of
`components/ui/sidebar.tsx` records each one. Two are worth generalising:

- **Generated persistence is Next.js persistence.** The provider wrote its open state to a cookie because the
  reference's server rendered the first paint. A cookie only earns its keep when a server reads it; here the app
  owns the preference in localStorage (`layout/sidebar-preferences.ts`) and drives the provider through
  `open`/`onOpenChange`. The theme (F010) set the same precedent.
- **`no-scrollbar` styled nothing.** Utility classes from `shadcn/tailwind.css` are silently dead in a project
  that does not import it (§5 item 3). Removing the class was the fix; the global themed thin scrollbar applies.

And one source bug deliberately **not** copied: the reference positions its collapse chevron `absolute -right-3`
inside a wrapper with no positioned ancestor, so the chevron anchors to the viewport and escapes to the right edge
of the screen. Anchor floating furniture to an element you positioned yourself.

### "No inert buttons" changes what a shell renders

The reference header always renders its bell, avatar menu and project switcher, with data arriving later or not
at all. CLAUDE_MASTER forbids placeholder controls, so the shell renders a control only when its backing exists:
the search trigger appears when F016 passes `onSearchClick`, the context slot when a module passes an enabled
adapter (F015), the profile menu when F032 supplies a user. A shell that looks emptier than the reference for a
few tasks is the intended state, not a defect — do not "fix" it by rendering dead controls.

### `RouterProvider` renders the route tree only

`<RouterProvider router={router}>{extra}</RouterProvider>` silently drops `extra`: the provider has no children
slot, so UI passed there is never rendered. F016 lost a test round to a command palette that "rendered nothing"
for exactly this reason. Put extra UI inside a route element.

### The API client and its generated types (F018)

- **The generated artefacts are committed, so regeneration must be byte-stable.** `backend/openapi.json` is
  written with sorted keys, a fixed indent and an explicit `newline="\n"`; `openapi-ts` output is deterministic.
  Both were verified by hashing across repeated runs. A platform-dependent newline or an unstable key order would
  turn F061's `git diff --exit-code` drift check into noise.
- **`Path.write_text` writes CRLF on Windows.** The default text mode translates `\n`; this repository checks
  `git ls-files --eol` for `w/lf` everywhere, so any Python script that *writes* a committed file must pass
  `newline="\n"` explicitly.
- **MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`.** The old key is a TypeScript error here, but at
  runtime an unknown option is silently ignored — a strict test setup would quietly degrade to warnings.
- **Axios' XHR adapter and MSW work together in jsdom** without forcing an adapter or a fetch shim; a request made
  through the shared client is intercepted by `setupServer` as-is. The trap is elsewhere: unmatched requests must
  be configured to *fail* (`onUnhandledFrame: 'error'`), or a test that forgot its handler just hangs or warns.

### TanStack Table v9 is not v8 (F020)

The reference uses v8; this project is on **v9**, and the API moved. None of it is discoverable from v8
tutorials, so the shape is recorded here:

- **Features are declared, not switched on.** There is no `getCoreRowModel: getCoreRowModel()` option block.
  `tableFeatures({ rowSortingFeature, … })` is the one value a table is built from, and `useTable(options)` is
  the hook (`useReactTable` is gone).
- **Row models come from feature *slots*.** A feature on its own gives state and APIs but no pipeline stage:
  sorting needs `sortedRowModel: createSortedRowModel()`, pagination `paginatedRowModel:
  createPaginatedRowModel()`, filtering `filteredRowModel: createFilteredRowModel()`, faceting
  `facetedRowModel`/`facetedUniqueValues`. Only the core model has a default, so a missing slot fails
  *silently* — the stage is skipped and the table quietly stops sorting. `ValidateFeatureSlots` catches a slot
  without its feature, not a feature without its slot.
- **Filter and sort functions are registered by name.** `globalFilterFn: 'includesString'` and
  `filterFn: 'facetIncludes'` only type-check when the name is present in the features' `filterFns`/`sortFns`
  record — the kit registers the built-ins plus its own facet function.
- **`getVisibleCells()` is part of the visibility feature**, as are `getVisibleLeafColumns()` — rendering a
  table without `columnVisibilityFeature` fails to compile on the first cell loop.
- **`arrIncludesSome` is array-only.** Given a scalar column value it returns false for every row, i.e. a filter
  that looks wired and does nothing. The kit registers `facetIncludes` for scalar-or-array columns, which is
  what `DataTableFacetedFilter` expects.
- **`state` lives on the React table, not the core one.** The instance type is `ReactTable` (which adds
  `state`, `Subscribe` and `FlexRender`); `Table` from `table-core` has none of them.
- **A sort-index badge in a header button renames the button.** "Name" becomes "Name 1" (the same accessible-name
  trap F019 hit with a loading spinner) — the badge is `aria-hidden`, and `aria-sort` on the `<th>` carries the
  state.
- **`useDataTable` lives in `data-table-context.tsx`** for the cycle reason above: the table renders the toolbar
  and footer, and both need the table back.

### The form kit's own traps (F019)

- **The `base-nova` registry has no `form` item, and the CLI says nothing.** `shadcn add form` prints
  "Checking registry ✔" and exits 0 without creating a file or an error — a silent no-op. `components/form/form.tsx`
  is therefore hand-written (like `date-picker`/`time-picker` in F014), and mirrors the documented §5.4 pattern with
  `cloneElement` standing in for Radix's `Slot`, which this stack does not have.
- **A control that does not forward unknown props silently breaks its field.** `FormControl` injects
  `id`/`aria-describedby`/`aria-invalid` into its child; `DatePicker`/`TimePicker` destructure their props, so
  those injections vanished without a type error. They now take `aria-describedby` (and `invalid`) explicitly —
  and `FormControl`'s child type names the three props a control must accept.
- **jsdom dispatches clicks on disabled buttons.** F019's duplicate-submit test clicked the busy submit button
  "to prove" no second request goes out — and a second request went out. Real browsers cannot activate a disabled
  button, so the guard (disabled + `aria-busy` while pending) is asserted as *state*, not by clicking again. Same
  family as the other jsdom gaps in this section: the DOM is only an approximation of the browser.
- **A `Spinner` inside a `Button` renames the button.** The Spinner carries `role="status"` and
  `aria-label="Loading"`, so a busy button's accessible name became "Loading Delete user" — bad for voice control
  and for anyone referring to the button by name mid-action. `Button` now renders it `aria-hidden`; `aria-busy`
  already carries the state (the same duplicate-live-region rule F017 applied in `LoadingState`).
- **Base UI's `Checkbox` renders a hidden input next to its button**, so `getByLabelText` matches twice; query the
  checkbox by role. The label association still names the control.
- **`handleSubmit` + `useMutation`: return `mutateAsync`.** With `mutate(values)` the submit handler returns
  `undefined`, RHF considers the submission finished immediately and `isSubmitting` never turns true — so
  `FormActions` would never show the pending state. The canonical wiring is
  `form.handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined))`: the catch stops the
  rejection escaping `handleSubmit` after the mutation's own `onError` mapped it onto the form.

### A circular import is invisible to every check except a browser (found after F017)

F017 added `RouteGuard` to the registry's `buildRouteObjects` and thereby closed a cycle:
`config/navigation.ts → layout/route-guard.tsx → providers/access-provider.tsx → config/navigation.ts`. The
provider reads `ANONYMOUS_ACCESS` at module scope (`createContext(ANONYMOUS_ACCESS)`), so evaluation order
decided the outcome: enter via `navigation.ts` and the binding is still in its temporal dead zone —
`ReferenceError: Cannot access 'ANONYMOUS_ACCESS' before initialization` — and the page is blank.

What made it survive the task's own checks: **`tsc`, the Vite build and Vitest all tolerate the cycle.** F017's
"checks run" were green; its dev-server smoke test was HTTP fetches (module *serving*, not evaluation); the
operator had not yet opened the app. It surfaced the first time a real browser loaded it, and was reproduced
outside the tests with headless Chrome:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --user-data-dir=$env:TEMP\chrome-smoke --virtual-time-budget=9000 `
  --enable-logging=stderr --dump-dom http://localhost:5173/
```

An empty `<div id="root">` plus a `CONSOLE` line naming the module *is* the failure; the rendered shell is the
pass. Two rules and one guard came out of it:

- **A module-scope read is what turns a cycle into a crash.** Function-body reads survive cycles; reads in the
  module body itself (`createContext`, constant tables, decorators) do not.
- **The access model is a leaf.** It lives in `config/access.ts`, imports nothing, and `navigation.ts`
  deliberately does not re-export it (a re-export would re-close the cycle). `RouteDefinition extends
  AccessRequirement` rather than restating the three fields.
- **`tests/lib/module-graph.test.ts` fails on any import cycle in `src/`** — it walks the static graph, skips
  `import type` (erased by `verbatimModuleSyntax`, so type-only edges cannot cycle at runtime) and dynamic
  `import()`, and prints the cycle path. Type-checking does not catch this class of bug; this test does.

## 13. Non-goals and deferred choices

- No service worker, offline mode or PWA — "offline" in this project means *network-failure handling*, not
  offline-first.
- No S3, mail server, OAuth/SSO or public signup.
- No microservices, message broker or background worker beyond bounded `BackgroundTasks` or a PostgreSQL
  outbox (§8.4e).
- Session timeouts and password-policy parameters are **initial defaults** here; the concrete values are
  confirmed at F025/F026 rather than invented now.
