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
  config/         navigation.ts, permissions.ts, branding.ts
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
# then, for every file the generator touched:
sed -i 's|from "cn"|from "@/lib/utils"|g' src/components/ui/*.tsx
sed -i '/^"use client"$/d' src/components/ui/*.tsx
pnpm remove cn   # if the generator added it back
```

Three deliberate corrections to the generated output, all required by the pack:

1. **`cn` import remap.** `base-nova` items import a helper from the `cn` package. §2.1 names `clsx` +
   `tailwind-merge`, and the reference carries `lib/utils.ts`, so `src/lib/utils.ts` exports our own `cn` and the
   import is rewritten. Skipping this leaves an undeclared dependency.
2. **`"use client"` removed.** A Next.js directive with no meaning in a Vite SPA (§0.5).
3. **`shadcn/tailwind.css` is not imported**, and the `shadcn` CLI is not a project dependency. F009 predicted
   the primitives would need it; F011 showed they do not — the generated components use only standard Tailwind
   utilities plus our tokens, and render correctly without it. Add it only if a future component demonstrably
   needs it.

4. **Never run the generator without checking `git status` afterwards.** `--overwrite` does not only touch the
   components being added: registry items declare dependencies on other components (`dropdown-menu`, `dialog` and
   `sheet` all depend on `button`), so the CLI regenerates those too and **silently reverts local modifications**.
   F013 hit exactly this — `button.tsx` lost its `loading` prop and `Spinner` usage. After every generation:

   ```bash
   git status --short frontend/src/components/ui/     # anything modified that you did not expect?
   git checkout HEAD -- frontend/src/components/ui/<file>   # restore the committed version
   ```

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

## 12. Non-goals and deferred choices

- No service worker, offline mode or PWA — "offline" in this project means *network-failure handling*, not
  offline-first.
- No S3, mail server, OAuth/SSO or public signup.
- No microservices, message broker or background worker beyond bounded `BackgroundTasks` or a PostgreSQL
  outbox (§8.4e).
- Session timeouts and password-policy parameters are **initial defaults** here; the concrete values are
  confirmed at F025/F026 rather than invented now.
