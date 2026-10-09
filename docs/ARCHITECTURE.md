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
| Secret | 256-bit random session ID; only its **SHA-256 hash** is stored. Raw value never logged or persisted. F025 implements the contract: `hash_session_token` produces the hex digest, `sessions.token_hash` holds it, and a CHECK accepts nothing else. |
| Rotation | New ID issued on login, on password change/reset, on any change to the user's roles, and on privilege escalation |
| Theft detection | Presenting a **superseded** session ID (rotation replay) revokes the whole session family and records an audit event |
| Idle timeout | 12 h default, refreshed on activity — `Settings.session_idle_timeout_minutes`, confirmed at F025 |
| Absolute lifetime | 30 days default regardless of activity, never extended — `Settings.session_absolute_lifetime_days`, confirmed at F025 |
| Multiple sessions | allowed; each row is independently revocable (`logout-all` = revoke all rows for the user) |
| Re-evaluation | every request resolves the user **and** effective permissions from the DB, so a role change applies on the next request without stale privilege |
| CSRF | `SameSite=Lax` **plus** mandatory `Origin`/`Referer` validation on unsafe methods **plus** a double-submit `X-CSRF-Token` header (token issued as a readable companion cookie at login) |
| Audit | session created / rotated / revoked / theft-detected are audited events |

Cost: one indexed lookup per request. Acceptable for a single-company internal application; a process-local
micro-cache is permitted later (`BIG-PROMPT` §0.6 allows process-local caches for disposable optimisation) but
is explicitly **not** part of this design.

### Password policy (F026)

Argon2id (RFC 9106) with parameters **reviewed in code, not configured by the environment** —
`ARGON2_PARAMETERS` in `app/core/security.py`: 19 MiB, `t=2`, `p=1`, the first profile the OWASP Password
Storage Cheat Sheet lists. A deployment that could weaken the hash function through a variable is a foot-gun;
what *is* policy lives in `Settings`:

| Rule | Value | Where |
|---|---|---|
| Minimum length | 12 | `password_min_length` |
| Maximum length | 128 (a hostile megabyte "password" must not become a memory event) | `password_max_length` |
| Denylist | embedded common-password list, case-insensitive exact | `COMMON_PASSWORDS` |
| Email | may not equal the address or its local part | code |
| Login throttling | 5 attempts per 15 minutes, per account and per IP | `login_max_attempts`, `login_attempt_window_minutes` |

No composition rules (mixed case/digit/symbol) on purpose: they push people toward `Pa55word!`, exactly the
shape a denylist catches, while length and the denylist do the real work. Three properties are tested as
rules, not conventions: the stored value never contains the password, an unusable stored hash verifies
`False` and rehashes `True` instead of raising, and a policy message never echoes the candidate. Rolling the
parameters upward later needs no reset wave: `password_needs_rehash` tells the next successful login to
re-hash.

Throttling is DB-backed (no Redis, §8): one generic `rate_limit_buckets` row per key, counted by a single
atomic upsert in `app/core/rate_limit.py` — §12 records why the statement, not a lock, is the concurrency
story.

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
rate_limit_buckets   (F026: one fixed-window counter row per key — DB-backed
                      throttling, no Redis; login attempts are keys, not a
                      second table)
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
- **Implemented in F023.** `app/core/database.py` holds what every table inherits: `Base` with a naming
  convention (unnamed constraints still reach PostgreSQL as `pk_…`/`uq_…`/`fk_…`), `UUIDPrimaryKeyMixin`
  (`uuidv7()`, PostgreSQL 18 — time-ordered, so inserts append to the primary-key index), and `TimestampMixin`
  (`timestamptz` instants; `updated_at` moved by the ORM's `onupdate`). The async Alembic environment lives in
  `backend/migrations/` and takes its engine from the application, so the CLI and the app cannot point at
  different databases — the committed `alembic.ini` deliberately carries no URL. Revisions are hand-numbered
  (`alembic revision -m "…" --rev-id 0002`) so the directory reads in order, and **revision 0001 creates no
  tables**: it is the chain's root, and each table arrives with the task that owns it. F024 added the identity
  group (revision `0002`); F025 the `sessions` table (revision `0003` — hashed token key, rotation family, two
  ordered deadlines, an all-or-nothing revocation over a closed reason vocabulary, and a unique replacement
  chain). The full chain `upgrade head` / `downgrade base` / `upgrade head` runs clean against PostgreSQL 18.6.

## 10. API contract

- Versioned prefix `/api/v1`; OpenAPI generated by FastAPI and used as the source for a typed frontend client
  (DTOs generated in F018, drift-checked in CI at F061; documented in `docs/OPENAPI_CLIENT.md`).
- Consistent error shape `{ "detail": ... }` with deliberate `200/201/204/400/401/403/404/409/422/429`
  semantics. Validation errors are field-addressable so forms can map them onto inputs.
- Health vs readiness are separate: `/health` is liveness; `/ready` additionally checks PostgreSQL (and
  Gotenberg where reports are required) and is not public.
- Pagination is keyset-or-offset **with a total**, and the UI never disagrees with the server's count.

## 11. Consequence of the session choice for the task list

Discharged. When §3 was written, two task-list entries changed meaning under the opaque-session design:

- **F025** builds the `sessions` table (not `refresh_tokens`) — **done**: `app/models/session.py`, revision `0003`.
- **F029** covers session rotation, superseded-ID replay detection, logout/logout-all and CSRF policy (not
  refresh-token rotation). `TASKS.md` was amended to say exactly that; no further action is outstanding.

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

### CSV, and the spreadsheet it lands in (F022)

- **A CSV is an execution format as far as a spreadsheet is concerned.** A cell starting with `=`, `+`, `@`, a tab
  or a carriage return is evaluated; `'` in front makes it text. `neutralizeFormula` (in `lib/csv.ts`) applies
  that, and is deliberate about the one case that would otherwise corrupt data: **a leading `-` is only
  neutralised when what follows is not a number**, so `-42` stays an amount while `-1+1` stops being a formula.
  Headers are cells too.
- **The BOM is added at download time, not by `toCsv`,** so the string a caller writes (and a test compares) is
  free of an invisible character. Excel then reads the file as UTF-8 rather than the system code page.
- **Testing a BOM is a trap in both directions.** `Blob.text()` and a default `TextDecoder` both *strip* a leading
  BOM per the Encoding spec, so a text comparison passes whether or not the BOM is there: compare the first bytes
  (`0xEF 0xBB 0xBF`) and decode with `{ ignoreBOM: true }` if the text matters too. jsdom also has no
  `URL.createObjectURL`, so the download tests stub it — and capture what the anchor *clicked with*, because the
  anchor is removed in the same turn.
- **Export what the user sees.** `exportTableCsv` takes its columns from the table's visible leaf columns in
  their current order, so F021's preferences decide the file. Rows default to the current page; a server-mode
  screen that wants the whole result set fetches it and passes `rows`, because silently exporting a page while
  claiming to export the dataset is the quiet kind of wrong.
- **Import reports every bad row and cannot half-write.** `importCsvRows` returns `records` *and* `errors`, with
  spreadsheet row numbers (header is 1); `ok` — not the length of `records` — is the only thing a caller may
  branch a write on.

### Table preferences, and Base UI's menus (F021)

- **The preference boundary is a store, not a component.** `table-preferences.ts` holds the interface
  (`load`/`save`/`clear`) plus the localStorage implementation; `useTablePreferences(tableKey)` is the hook the
  pages spread into `<DataTable>`. The key is `app.table.<scope>.<tableKey>`, where `scope` is the user — the
  literal `anonymous` until F032 supplies a session, which is why two accounts on one machine would share
  preferences today and will not tomorrow. **F048** swaps in the server-backed store through
  `setTablePreferencesStore`; nothing else changes. Storage is treated as hostile (user-writable, another
  version's shape, throwing in private mode): an unreadable entry reads as "no preference", never a crash.
- **"No preference" is not the same record as "defaults".** `reset` *removes* the entry instead of writing the
  defaults out; the defaults are also what a missing entry means, so the smaller record is the honest one.
- **Ordering is buttons, not drag.** Drag is the reference's gesture, needs a pointer, is invisible to keyboard
  users unless re-implemented, and is barely testable in jsdom. Two labelled move items write the same
  `columnOrder` state; `@dnd-kit` (in the stack list) can layer on later if the operator wants the gesture.
- **Base UI's menu items are not Radix's.** `DropdownMenuLabel` **throws** unless it has a `DropdownMenuGroup`
  ancestor; items fire **`onClick`** (`onSelect` is the Radix API and is silently ignored); a checkbox item
  **keeps the menu open** after toggling, so a "reset" item does not need the menu reopened; and the menu mounts
  asynchronously — query it with `findByRole`, because a synchronous `getByRole` right after the trigger click
  finds nothing and looks like a broken trigger.

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

### Bulk UPDATEs bypass the identity map (F025)

A Core `update()`/`delete()` statement runs in the database, not through the ORM, so **objects already loaded
in that session keep their stale attribute values** — a row the update just revoked still reads `revoked_at is
None` from the in-memory instance. This matters wherever a bulk write is followed by reading the same rows
back in the same session; F029's family revocation is exactly that shape. The fix is either
`select(...).execution_options(populate_existing=True)` (re-populate what the query returns) or
`session.refresh(obj)` for a single row. `test_session_model.py::test_replaying_a_rotated_id_revokes_the_whole_family`
demonstrates the pattern — and why trusting the cached instance would have made the test pass for the wrong
reason.

### Passwords, throttling, and what "no plaintext" means in code (F026)

- **`mapped_column(repr=False)` is a dataclass-only argument in SQLAlchemy 2.1.** On a plain `DeclarativeBase`
  mapping it raises `Attribute 'hashed_password' … includes dataclasses argument(s): 'repr'` at import. The
  model that must not print its hash therefore defines `__repr__` itself (`User` — identity only), and a test
  pins that the hash cannot appear in it.
- **"The message never contains the value" cannot be asserted with the value `password`** — the message's own
  English words trip the check. Echo tests use canary values (`P@ssw0rd`, `qwerty12345`) that cannot collide
  with prose; the general lesson is to pick canaries that make the assertion mean what it says.
- **A concurrency test cannot use the rollback fixture** — one transaction cannot race itself. The single
  test that opens its own connections (twelve logins racing one bucket) writes a unique key and deletes
  exactly that row in a `finally`. The F024 rule "let the fixture roll back" now has that one stated
  exception.
- **A counter primitive is only as good as its racing story.** `INSERT … ON CONFLICT DO UPDATE … RETURNING`
  makes N concurrent hits return the distinct counts 1..N; the test asserts exactly that, so a
  SELECT-then-UPDATE rewrite fails loudly instead of silently losing updates. The known cost of a *fixed*
  window — a caller can spend the full budget before a boundary and again after — is accepted and documented
  in the module rather than engineered away.

## 13. Non-goals and deferred choices

- No service worker, offline mode or PWA — "offline" in this project means *network-failure handling*, not
  offline-first.
- No S3, mail server, OAuth/SSO or public signup.
- No microservices, message broker or background worker beyond bounded `BackgroundTasks` or a PostgreSQL
  outbox (§8.4e).
- Session timeouts and password-policy parameters are **initial defaults** here; the concrete values are
  confirmed rather than invented now — **F025 confirmed the session lifetimes**
  (`Settings.session_idle_timeout_minutes` = 720, `session_absolute_lifetime_days` = 30) and **F026 the
  password policy** (12–128 characters, denylist, 5 login attempts / 15 minutes — §3).
