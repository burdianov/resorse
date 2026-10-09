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

### Login — the first session (F028)

`POST /api/v1/auth/login` (`app/api/v1/auth.py`, service in `app/services/auth.py`) is where a password
becomes a session, and where BP-6.2g's "no user enumeration" stops being an intention and becomes the
mechanics:

- **One refusal for every cause.** Unknown email, wrong password, deactivated account, deleted account,
  unusable stored hash — one 401, one body. "This account is disabled" is exactly the fact an enumerator
  wants, so it is never said.
- **Comparable timing.** An unknown email still pays one Argon2 verification, against a decoy hash generated
  at import under the current parameters (`_DUMMY_PASSWORD_HASH`). A test asserts the decoy is
  current-parameter — a stale decoy would be the fast path, re-opening the channel it exists to close.
- **One throttle answer.** Both buckets (per account, per address) are counted *before* the lookup and
  whether or not the account exists; a denied attempt raises one 429 with `Retry-After` and a body that
  depends only on the caller's own behaviour. The throttle gates before the password check, so a throttled
  caller cannot even burn verification work.
- **Failures persist.** The service commits the rate-limit counters *before* raising: a failed login that
  rolled back its own count would be a throttle that never throttles. This is the one deliberate exception
  to the "a handler that raises commits nothing" rule recorded in `app/core/database.py`.
- **A success resets the account budget only.** The account bucket is cleared (a legitimate user who
  fumbled four attempts is not half-locked); the address bucket is not, or one known credential would buy
  a fresh guessing budget for other accounts.
- **Cookies here, enforcement there (F029).** Login issues the `__Host-session` cookie (HttpOnly, Secure,
  SameSite=Lax, Path=/, no Domain, no Max-Age — a browser-session cookie; the row's deadlines are the
  authority) and the readable `__Host-csrf` companion, which `app/core/csrf.py` (F029) checks on every
  unsafe method. The attributes live in `app/core/cookies.py`, one spelling for login, rotation and
  logout. `Secure` even in development: browsers treat `http://localhost` as a secure context, and the
  `__Host-` prefix requires it.
- **The throttling address is the transport's peer** (`request.client.host`). `X-Forwarded-For` is
  deliberately not consulted — without a validated proxy it is client-controlled and its trust would be a
  rate-limit bypass; that validation is deployment configuration (F060).
- **A below-policy hash is upgraded on the way through** (`password_needs_rehash` → re-hash with the
  plaintext in hand), so raising Argon2 parameters never needs a reset wave (F026's promise, kept here).
- `token_version` is not touched — and F029 decided (C18) it never is: the session row is the only
  revocation unit, and deactivation, password change and role changes revoke rows rather than bump a
  counter.

The response is identity only (`id`, `email`, `full_name`, `must_change_password`) — no roles, no
permissions. The effective permission union is F031's dependency and will be served by `/auth/me`; one
definition of the access set beats two that almost match.

### Sessions at request time (F029)

`resolve_session` (`app/services/sessions.py`, wrapped by the dependencies in `app/api/v1/dependencies.py`)
is the one place a cookie becomes an identity. The rules are ordered so the dangerous case is handled first:

- **A superseded ID is a replay.** A row revoked as `rotated` being presented again means a rotation's
  predecessor outlived its rotation — a thief, or the victim's stale tab; the two are indistinguishable, so
  both get the same answer: every live member of the family dies as `theft_detected`, and the presented row
  keeps its `rotated` record (the history of what happened first survives what happened next). The check
  runs before expiry, and it applies wherever the cookie is presented — logout included, because a stale
  cookie is not a loophole.
- **Expiry and logouts are quiet refusals** — one 401, no write. Expiry is not a security event. A
  deactivated or deleted user's live row is refused but left alone for the admin flow (F033) to revoke with
  a real reason: refusing access and recording why are different obligations.
- **The idle deadline slides on activity**, capped at the absolute deadline that never moves — and the
  resolver commits the slide itself, because the clock moved whatever the handler does next (the
  bookkeeping rule of `app/core/database.py`; login's commit-before-raise is the same instinct).
- **Rotation** issues a successor in the same family — predecessor `rotated` + `replaced_by_id`, one
  commit — and the successor **inherits the absolute deadline**: an absolute deadline is precisely the
  promise that no rotation extends it. Its idle deadline restarts. Rotation is fired by events (password
  change F030, role change F035), never by a refresh endpoint (C12).
- **Logout is 204, always.** Its goal state is "no session", which a junk cookie already satisfies, so
  there is no failure to report and nothing to report it to; both cookies leave the browser either way.
  **Logout-all** is the opposite: it acts under a session (401 without one) and revokes every live row of
  the user.

CSRF is `app/core/csrf.py` — an ASGI middleware rather than a per-endpoint dependency, so that a future
unsafe endpoint is covered before its author writes it. The two checkable layers of the table above:

- On POST/PUT/PATCH/DELETE, a claimed `Origin` (or, failing that, `Referer`) must reduce to an origin in
  `Settings.allowed_origins` (`ALLOWED_ORIGINS`; the default is the development Vite origin, because the
  browser's origin is the *frontend's*; F060 validates it in production). `Origin: null` reduces to nothing
  and is refused. A request claiming **no** origin is a scripted client — the double-submit is the binding
  check for it, and browsers always claim one.
- A request **carrying the session cookie** must also present `X-CSRF-Token` equal to the `__Host-csrf`
  cookie (constant-time, compared as bytes — a hostile non-ASCII header earns a 403, not a 500). The only
  exemption is `POST /auth/login`'s double-submit: login *establishes* a session rather than acting under
  one, and the dead HttpOnly cookie a browser cannot delete would otherwise lock the user out of the login
  form. Login CSRF remains covered by the origin check.

### Changing a password (F030)

`POST /api/v1/auth/change-password` (`app/services/passwords.py`) serves both the forced first-login change
and Profile > Security — the same request, because they are the same act. BIG-PROMPT §6.1 fixes the
asymmetry: "password changes require current password except privileged reset."

- **The current password is required even during a forced change** — the temporary credential is still the
  account's secret, and asking for it keeps the flow honest about who is sitting there.
- **The verification is throttled, in its own bucket.** A stolen session cookie would otherwise be a
  password oracle running at Argon2 speed that the login throttle never sees. The attempts count against
  `password:account:<email>` — deliberately *not* login's bucket, so neither flow can lock the other out —
  the gate runs before the verification work, failures commit before raising (F028's lesson), and a
  *verified* current password clears the bucket, exactly as a login forgives the login bucket.
- **Refusals are field-addressable 422s**, never 401: a wrong current password lands at
  `body/current_password`, policy violations at `body/new_password` (all of them, one round trip). The
  entries mirror Pydantic's shape *minus* `input` — Pydantic echoes the offending value, and for credential
  fields that value is a password; the frontend's field mapper reads `loc`/`msg` only, so the omission costs
  the client nothing. And a 401 is how this API says "your session is over" — the status the frontend's
  logout policy keys on; a typo on a form must not sign the user out.
- **Policy runs in the service, not the schema**, because the denylist's email rule needs the *stored*
  address — the request body cannot know it. New-equals-current is a policy violation too
  (`SAME_AS_CURRENT_VIOLATION`): re-adopting the credential being replaced is exactly the accident the
  confirm field exists to catch.
- **Success is one commit**: the new hash (always under current F026 parameters — a change *is* the
  rehash), every *other* session revoked as `password_change`, the asking session **rotated** (F029's
  `rotate_within`, absolute deadline inherited), `must_change_password` cleared, `password_reset_at`
  stamped. Splitting the commit — rotate first, re-hash later — would leave a live successor session that
  outlived the password it was minted under.
- **The admin reset is a different animal** (`reset_password`): it generates the temporary credential
  (F026's `generate_password`, policy-checked), forces the change at next sign-in, revokes **every** session
  of the target as `admin`, and returns the temporary value for shown-once delivery. It never asks for the
  current password — the authority is the caller's permission, which is why its HTTP endpoint
  (`POST /api/v1/admin/users/{id}/reset-password`) belongs behind F031's `users.reset_password` guard and is
  built by F033, on top of this service.

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

### First run — the seed and the admin bootstrap (F027)

There is **no default account and no default credential** (BP-0.7; `DECISIONS.md` C15). Two idempotent
CLIs stand between a fresh database and a usable platform:

- **`python -m app.seed`** creates the 17 permission codes — `app/core/permissions.py` holds the one
  machine copy (`PermissionCode`), consumed by the seed, F031's guards and F037's dictionary alike — and
  the three default roles (C16): `super_admin` (every code; `is_system=true` — the protected role, whose
  grant set the seed re-asserts on every run, safe because F035 keeps its matrix column read-only),
  `admin` (every code except `roles.manage`/`permissions.manage` — the authority dictionaries stay with
  the protected role, BP-6.3e), and `viewer` (an explicit read set, §6 — never the source's "block if
  viewer" shortcut). Creation is create-if-missing: existing permission rows and non-system roles are
  never modified, because F036's matrix and F037's dictionary own edits after creation. The seed never
  creates or modifies users — a seed that provisioned accounts would be a credentials-by-deployment
  backdoor.
- **`python -m app.bootstrap_admin`** creates the one super-admin: `is_superuser=true` (the explicit
  super-admin handling §6 relies on) **and** holding the `super_admin` role (visible and revocable in the
  matrix), with `must_change_password=true` — the operator's password is a temporary credential
  (BP-6.1b). The password comes from `--generate-password` (printed exactly once), the
  `BOOTSTRAP_ADMIN_PASSWORD` variable, or a hidden prompt; with no source the command **refuses and
  writes nothing**. That refusal is the "no default credentials" acceptance, and the tests prove it
  structurally: a session factory that raises if it is ever called. The CLI reads its two `BOOTSTRAP_*`
  variables itself (via `python-dotenv`, a now-declared dependency) — **never through `Settings`**, so no
  bootstrap secret ever loads into the API process. It refuses when an active superuser exists or the
  email is taken — never resetting or escalating an existing account — while an inactive or deleted
  superuser does not block, because fail-closed login would otherwise strand the operator with no
  recovery path. Concurrent first runs serialise on a transaction advisory lock; the hard invariants stay
  the database's. The email is validated with the same `EmailStr` validator F033's API will use and
  canonicalised to lowercase before insert.

### Consequences to carry into dependent tasks

Choosing opaque sessions removes three things the requirements assumed. None is silently dropped:

| Requirement | Status under this design | Owning task |
|---|---|---|
| `POST /api/v1/auth/refresh` (§8.3 endpoint list) | **Not implemented — no such concept.** §8.3 permits evolving endpoints when justified; refresh is absent because there is no token to refresh. Session lifetime is extended server-side instead. | F028, F029 |
| §6.2e single-flight refresh interceptor | **Not needed.** The Axios client retries once on a `401` after re-resolving auth state, with no refresh call and no cross-tab coordination. | F018, F032 |
| F029 "rotation reuse detection" | **Reinterpreted**: reuse detection applies to a rotated session ID being presented again (family revoked) rather than to refresh-token families. The task's other halves — logout, CSRF policy — stand unchanged. Implemented in F029 (`app/services/sessions.py`, `app/core/csrf.py`). | F029 |

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

### The session layer (F032)

The SPA's understanding of the session lives in exactly one place (`src/lib/auth.tsx`), and its status *is*
§6.2e's rule — the two refusals stay distinct:

| status | meaning | what renders |
|---|---|---|
| `loading` | nothing known yet | a pending state |
| `authenticated` | `/auth/me` answered 200 | the app; `NavigationAccess` comes from the response |
| `anonymous` | `/auth/me` answered **401** | redirect to `/login`, the intended path in location state |
| `error` | `/auth/me` unreachable (network/5xx) | **Retry** — a hiccup is not a logout |

- **There is no refresh** (C12): `api.ts`'s 401 machinery is F018's, and F032 registers its handler —
  one `/auth/me`, single-flight, the original request retried once. `/auth/*` requests are never retried.
- **Login and password-change re-read `/auth/me`** rather than extending the login response: the permission
  union has one source (F028's identity-only response was the point).
- **Identity transitions clear the query cache** (`queryClient.clear()`), the belt to `queryKeys`'
  id-in-key suspenders; a same-user refresh never clears.
- **CSRF is an interceptor, not a discipline**: every unsafe request gets `X-CSRF-Token` from the readable
  `__Host-csrf` cookie (F029's middleware refuses without it).
- **`/login` and `/change-password` are standalone routes** — no shell. The anonymous visitor has no frame;
  the forced-change user has one they are not yet allowed to use (F031 refuses regular endpoints until the
  change completes), so rendering a sidebar of links that would all 403 would be a lie. `/change-password`
  still demands a session — it is the way out of the forced state, not a public page — and offers a
  *sign out instead* escape (§6.1's recovery rule, not a dead end).
- **The header's account menu** (F032) carries change password, sign out and sign out everywhere (the last
  behind F019's confirmation). Profile pages are F042's; until then no menu item links to one.
- **`MeResponse.is_superuser` rides `/auth/me`** (C21, amending C20's omission): `NavigationAccess` has an
  explicit super-admin flag for its visibility rules, and server truth beats a hardcoded `false`.
- Actions that fail on the wire never masquerade as auth outcomes: the login card and the change form show
  the server's own sentences (the uniform 401 verbatim; 422s mapped onto inputs — the API's field names
  equal the form's by design; 429 with the throttle message).

### The admin users screen (F034)

`pages/admin/users.tsx` is the first **server-mode** DataTable consumer — F020 built the mode and this
screen proves it: page, sort, search and the status filter are request parameters held in one state
record, `total` comes from the server (the footer counts rows the client never loaded), and
`placeholderData` keeps the previous page on screen while the next one arrives.

Three shapes worth keeping for F035+:

- **Server mode does not use the faceted filter.** Facet counts are computed from *loaded* rows; against a
  server page they would be quietly, confidently wrong. The status filter is a controlled `Select` in the
  toolbar, and the table's own column-filter slice stays out of the server path entirely.
- **Sorting is single-column and always on.** The API accepts one allowlisted field with an `id`
  tiebreaker; a "cleared" sort state would show an order the server never chose, so clearing keeps the
  current order (the header button cycles asc↔desc). Multi-sort (shift-click) is therefore not wired.
- **The UI mirrors the rules it can see, and defers the ones it cannot.** Controls disappear without their
  codes (§6.3d — the server is still the boundary), the self row's deactivate/delete are disabled with the
  reason attached (C22's self rules), and the last-super-admin 409 is *not* mirrored — it needs a count the
  list does not carry, so the server's sentence is the honest interface. The one-time password notice is
  one component because C22 made create's and reset's contracts identical, and `DataTableRowActions`
  (F034's contribution to the kit) owns the trigger and menu surface every later list reuses.

The route (`/admin/users`) is registered with `adminOnly` + `users.read`: `/admin` now redirects to the
first permitted administration route instead of answering 403, and the Administration group appears for
exactly the callers who hold a code in its namespaces.

### The role API and the atomic matrix (F035)

`app/api/v1/admin_roles.py` (over `app/services/roles.py`) completes the surface F034's read slice
opened: list/get under `roles.read`; create, patch, delete and one matrix save under `roles.manage` —
the code the seeded `admin` deliberately lacks (C16), because editing the authority dictionaries *is*
escalation.

The matrix save is the point. BP-7.4 rejects the reference's per-intersection PATCH loop for the obvious
reason: a loop can half-succeed. `PUT /admin/roles/matrix` carries the roles a client wants saved with
their **complete** code sets — and the service makes "one atomic save" structural, not aspirational:
every entry is validated (role exists, `is_system` rule, the subset rule applied to the *old* set as
well as the new, every code exists) **before the first write**, then one commit applies all the
replacements. The rollback test's shape is the proof: entry zero is perfectly valid — and stays unsaved
because entry one was not.

Rules worth holding onto for F036/F037:

- **Grants, not ids.** Payloads name permissions by code — the machine vocabulary the seed writes and
  the frontend registry mirrors. The service resolves them; unknown codes are 422 addressed at
  `roles.<i>.permission_codes`, the path a matrix cell can highlight.
- **`is_system` is the seed's column.** No rename, delete or re-grant — but a matrix payload may
  *include* the protected column unchanged (a UI sends its whole visible matrix; it should not have to
  special-case one column). Only an actual change is refused.
- **The subset rule runs both ways.** You may grant only what you hold — and you may edit only roles
  whose current grants you hold, because stripping a column you cannot see is authority you were not
  given. One primitive (`ensure_codes_assignable`, born in F033) serves both surfaces.
- **Deletion refuses while assigned** — `user_roles` cascades, and a cascade that silently strips
  authority is exactly what a safeguard exists to prevent.
- **Role edits do not revoke sessions.** Effective permissions re-evaluate every request (C20,
  BP-6.3f's chosen half), so a grant change lands on each holder's next request; signing every holder
  out for an edit they may not even lose access from would be disruption without a security gain
  (C24 supersedes §3's table wording on this point).

### The role matrix screen (F036)

`pages/admin/roles.tsx` is the UI half of BP-7.4's atomicity, and its central
decision is what a tick *is*: **draft state, never a request**. The matrix
renders every permission code (grouped by namespace, from the dictionary
endpoint F036's read slice opened) against every role (a column from the
catalogue), and however many cells an afternoon of editing touches, the save
bar counts them as one unsaved state — because the wire sees exactly one
`PUT /admin/roles/matrix` (F035/C24), carrying the whole visible matrix,
protected column included and unchanged. The reference's per-cell PATCH loop
cannot be recreated through this screen even by accident.

- **The draft seeds once** (`draft === null` gates the effect), so a
  background refetch can never clobber edits in progress; Reset re-seeds on
  demand, and a successful save re-seeds through `setDraft(null)` +
  invalidation — the bar always compares the draft against the server's
  current answer.
- **The save bar is the one place a failure is said** (`suppressErrorToast`):
  the server's sentence, with the field-error *entries* preferred for 422s —
  the API normaliser deliberately hides array-shaped details behind its
  fallback sentence, so the specific messages ride `fieldErrors` — and the
  draft survives any failure, because a failed save that looks like a lost
  edit teaches the wrong lesson about the system.
- **The seed-owned column renders read-only** (disabled checkboxes, lock,
  disabled menu items, all driven by `is_system`) — mirrors of the server's
  rule, which refuses regardless (§6.3d).
- **Role CRUD never touches grants.** Create/rename/delete live in column
  menus and dialogs; the permission set has exactly one write path (the
  matrix save), which is what keeps "atomic" a property of the system rather
  than of one endpoint.
- **Unsaved edits block navigation** through F019's `UnsavedChangesGuard`.

### The permission dictionary (F037)

`app/api/v1/admin_permissions.py` over `app/services/permissions.py` completes the catalogues: the
list F036's matrix reads, plus create/patch/delete under `permissions.manage` — the code the seeded
`admin` deliberately lacks (C16). The guardrails (C26) are shaped by what a code *is*:

- **A code in use is frozen in spelling.** Live grants mean "the code as it reads"; renaming one would
  silently rewrite what every holder authorises, deleting one would silently strip authority. Both
  answer 409 while any `role_permissions` row points at the code (F035's delete-while-assigned rule,
  applied to the other end of the grant edge). Descriptions carry no authority and edit freely; an
  *unused* code can be renamed (the typo caught before the first grant) or deleted.
- **Codes neither collide nor normalise silently.** The shape is the model's own
  `PERMISSION_CODE_PATTERN` — imported, one spelling — validated at the schema (a 422 on `code`), and
  `Users.Read` is *refused*, never quietly lowercased: a code is a machine-stable identifier, and two
  spellings must not mean the same authority. Duplicates are the unique index's verdict (409), the
  F024/F035 pattern.
- **No subset rule on the dictionary itself.** Creating a code confers nothing — it becomes grantable
  only through the matrix save, which already enforces "grant only what you hold" (C22/C24). Requiring
  a dictionary editor to already hold a code that does not exist yet would be a rule that cannot be
  satisfied. The seeded codes protect themselves: `super_admin` holds all 17 (C16), so every seeded
  code is in use, therefore frozen.
- **The seed stays idempotent** across operator-defined codes — it creates what is missing and never
  modifies existing rows, so F037's additions survive every seed run.

`pages/admin/permissions.tsx` (F038) renders the dictionary as a **client-mode** DataTable — the
list's unpaginated shape (C25/C26) makes in-browser sorting and search the honest choice, and the
tests assert rendered rows rather than query strings; the server-mode discipline of F034/C23 applies
only if the vocabulary ever grows past a screen. The refusals stay the server's: a local shape check
on the code is UX only, the 422 lands on the field, and the 409s (duplicate; the in-use freeze on
rename, in the dialog's root alert; the in-use delete, as the query layer's toast once the
confirmation closes) are the server's own sentences — the page never guesses usage, because the list
deliberately carries none.

### Application settings (F039)

`app_settings` (migration `0005`) holds **overrides for a registry declared in code**
(`app/core/settings_registry.py`, BP-7.5): four typed specs — app name, app description, the source's
five date formats, an IANA-validated timezone — each with a default and a validator. The properties
that matter:

- **Unwritten keys read as defaults.** The snapshot is defaults overlaid with stored rows, so a fresh
  deployment needs no seeding step and a key added in a later release starts at its default.
- **The registry is the allowlist.** A `PUT /admin/settings` body is the bare map of keys; unknown
  keys and invalid values are refused before the first upsert — validate everything, then write
  everything, in one commit (the F035 matrix discipline in miniature) — and the refusal addresses as
  `loc ["body", "<key>"]`, which is why F040's form fields carry the registry keys as their names.
  No DELETE verb exists: putting a key back to its default is the same outcome with a clearer history.
- **`updated_by` is SET NULL.** Attribution, not ownership: deleting a user must never delete a
  setting (F024's reasoning for audit-facing references).
- **What is deliberately not a setting** is as much the design as what is: the Argon2 parameters
  (reviewed constants, F026), session lifetimes and login throttles (session-wide effects no settings
  form should reach), and every secret — BP-7.5 keeps credentials in the environment. Notification
  keys arrive with F045, when their behaviour exists.

## 6. Authorization model

- **Roles and permissions are many-to-many.** Effective permissions = union of the user's roles' permissions,
  with explicit super-admin handling. A user may hold several roles. The seeded catalog (F027, C16):
  `super_admin` = every code, protected (`is_system`); `admin` = every code except `roles.manage`/
  `permissions.manage`; `viewer` = an explicit read set. The machine copy of the vocabulary is
  `app/core/permissions.py` (`PermissionCode`).
- **Permission codes are machine-stable and server-registered**, namespaced `resource.action`:
  `users.read|create|update|deactivate|reset_password`, `roles.read|manage`, `permissions.read|manage`,
  `settings.read|manage`, `audit.read`, `notifications.read|manage_own`, `files.read|create`,
  `reports.generate`. The frontend consumes the registry; it never invents entries.
- **Three enforcement layers, only one of which is security:**
  1. `require_permission(...)` dependency in the API — *the boundary*;
  2. SQL-level scoping in the query itself — *the boundary for row ownership*;
  3. `PermissionGate` / navigation visibility in the SPA — **UX only**, never load-bearing.
- **Fail closed.** Missing/unknown permission, inactive user, deleted user, expired or superseded session → deny.

### The guards, as built (F031)

`app/core/permissions.py::effective_permissions` is the one definition of the union: the codes across the
user's roles, folded per request from the graph F029's resolution already loaded (no cache — a role change
applies on the next request, BP-6.3f). **`is_superuser` is break-glass**: it expands to every code at
runtime, never persisted as grants, because the seed re-asserts `super_admin`'s matrix only when someone
runs it, and the account that exists to be un-lockable must not be locked out of a new code by deployment
order. The seeded role stays the visible dictionary of what that means (F036's protected column), never
the mechanism.

`app/api/v1/dependencies.py` implements the boundary with the *defaulting* doing the security work:

| Dependency | Answers | Used by |
|---|---|---|
| `optional_session` | raw resolution, `None` allowed | logout (idempotent) |
| `authenticated_session` | raw resolution, else 401 | the auth router's exemption list |
| `current_session` | **the default**: 401, or 403 while `must_change_password` is set | every regular endpoint |
| `require_permission(code)` | `current_session` + the union check (one generic 403) | everything that acts on privileged data |

The forced-change exemption list is exactly the auth router — logout, logout-all, change-password (it *is*
the change) and `GET /auth/me` (the SPA reads the flag there to route) — so a new regular endpoint is gated
unless its author types an exemption on purpose. `require_permission` takes a `PermissionCode` member, not
a string: a typo is an import error, and the vocabulary stays F027's one machine copy. `require_admin` from
BP-6.3c is deliberately absent — specific codes are the boundary, and the super-admin *business rules*
(last-super-admin protection, escalation prevention) are F033/F035's, built on `is_superuser` as data.

`GET /auth/me` serves identity + sorted role names + the expanded sorted union. No `is_superuser` in the
response (redundant once expanded — the frontend checks set membership, never a flag) and no `is_active`
(a disabled account's session never resolves). It stays reachable during a forced change. `PATCH /auth/me`
and the preferences live with F041.

### The admin user directory (F033)

Six endpoints under `/api/v1/admin/users` (`app/api/v1/admin_users.py` over `app/services/users.py`), each
behind one `require_permission` code, with the business rules — not the HTTP layer — owning the refusals:

- **Who may touch whom.** Superusers are managed by superusers only, for every verb including creation
  (§6.3's least-privilege list, made concrete). A role grant must be a **subset of the caller's own
  effective permissions**: the seeded catalogue makes this exact — a plain `admin` holds every code the
  `admin` role has, so it can grant `admin`, while `super_admin` is grantable only by a superuser (whose
  effective set is every code, C20). Nobody edits their own `role_ids`/`is_active` through this API —
  self-demotion is refused on purpose; own profile fields (name, email, phone) stay editable.
- **The one account the platform refuses to lose.** The last active super-admin cannot be deactivated or
  deleted (409), whoever asks. The check runs before the self rules — so a last super-admin deactivating
  *themselves* hears the platform's reason, not "no self-changes" — and after the target rule, so an
  unauthorized caller learns nothing about super-admin counts.
- **Deletion is soft and final** (BP-6.1b, §7.3): the row survives for audit, every session ends in the
  same commit (`admin`, F030's primitive), GET-by-id answers 404, and the email stays occupied — an
  account is never silently reborn.
- **The directory list filters in SQL** (BP-8.2): ILIKE search with escaped wildcards, a
  `sort` allowlist with `id` as the tiebreaker (offset pagination needs a *total* order), and a
  `total` counted from the same criteria the rows come from — the footer and the page cannot disagree
  (ARCHITECTURE §10). Soft-deleted rows are audit material, not directory entries.
- **Creation and reset install temporary credentials** exactly once (BP-6.1b): shown in the response
  only when the server generated them, `must_change_password=true`, and the policy runs before the hash —
  F030's exception classes, rendered as the same field-addressable 422s.

Two kinds of 403 live here, and the difference is deliberate: the *guard's* 403 says "you do not hold the
code this endpoint needs" and stays generic (F031); the *rule* 403s describe the rule a permitted caller
hit (escalation, protected account, self-changes). Conflicts are 409; field problems are 422 in the same
shape the forms already map. Audit events are **not** written yet — F043 owns the store and must backfill
them (recorded in C22 and the F033 handoff).

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
  chain); F026 the `rate_limit_buckets` table (revision `0004`); F039 the `app_settings` table
  (revision `0005`). The full chain `upgrade head` / `downgrade base` / `upgrade head` runs clean against
  PostgreSQL 18.6 (run the round-trip against a **scratch database** — `app_test` — never `app_dev`: the
  downgrade drops every table it touches).

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
  refresh-token rotation). `TASKS.md` was amended to say exactly that — **done**: `app/services/sessions.py`,
  `app/core/csrf.py` (the middleware in `app/main.py`), `app/api/v1/dependencies.py`.

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

### A prompting CLI keeps its refusal paths drivable (F027)

- **`main` is async, and `__main__` wraps it in `asyncio.run`.** A sync `main` running its own loop cannot
  be driven from an async test (`asyncio.run` inside a running loop raises), and the point of these tests is
  the *refusal* paths — so the tests `await main(...)` on the fixture's loop with an injected
  `session_factory`, and the refusal tests inject one that raises if it is ever called. "Nothing was
  created" is then structural, not a row count after the fact.
- **`isatty()` can lie about a redirected stdin.** Under Git Bash (MSYS2) a pty reports
  `sys.stdin.isatty() == True` even with `< /dev/null`, so a live CLI run enters the interactive branch and
  `getpass` blocks on the console with no human. A live no-TTY smoke run therefore drives the
  `interactive=False` seam (the same one the tests use); `--help` and the seed CLI still prove the real
  entry point and the real database path.

### A failed login still has to write (F028)

The obvious implementation of "commit only on success" makes the throttle useless: the rate-limit counters
are rows, the refusal path raises, the session is discarded — and every failed attempt rolls back its own
count, so the sixth guess starts from zero forever. The login service therefore **commits the counters
before raising** `InvalidCredentials` / `LoginRateLimited`; the rule "a handler that raises commits nothing"
(`app/core/database.py`) keeps its force for every other endpoint, with this stated exception. The
integration test that would catch a regression is not "six attempts are denied" but the follow-on: five
failures must leave `hit_count == 5` in the bucket row.

Two smaller traps in the same file, both now pinned by tests:

- **The suite's clock is frozen in the login tests (autouse patch of the service's `datetime`).** The rate
  limiter counts in epoch-aligned fixed windows; a test that straddles a boundary flakes — once in ~1000
  runs, which is exactly the kind of flake that costs an afternoon someday. Freezing also makes the two
  deadline columns and `Retry-After` exact instead of approximate.
- **SQLAlchemy 2.1 deprecates `noload()`** ("incorrect results — returns `None` for related items"). The
  login query suppresses the eager `User.roles` load with `raiseload()` instead — which is also the better
  statement: this path must never traverse the authorization graph, so a future edit that tries fails
  loudly rather than quietly costing two queries.

### Bookkeeping commits before the handler runs (F029)

Login's commit-before-raise stopped being a one-off: F029's request dependency also writes **before the
handler exists in the call stack**, and both writes must survive a handler that fails. The idle-deadline
slide is activity — a 404 still moved the clock — and the replay-triggered family revocation must outlive
the 401 that immediately follows it: the response is a refusal, the revocation is a fact. The rule of thumb
`app/core/database.py` now states: **the handler's unit of work commits in the service the handler calls;
bookkeeping commits where it is written.** The bulk-UPDATE identity-map trap recorded above (F025) reapplies
verbatim — the family revocation is that shape — so the tests re-read the affected rows with
`populate_existing=True` before asserting on them: the same discipline F025's model-level rehearsal called
for, now exercised through the real service and the real endpoint.

### Hand-built 422s omit `input` (F030)

FastAPI emits Pydantic's validation-error dictionaries verbatim, `input` included — the offending value
echoed back. Helpful for a mistyped enum; wrong for F030's change-password refusals, where the field under
validation is a *password* and a response body travels through logs, proxies and browser caches. The
endpoint therefore builds its own 422 entries (`{type, loc, msg}`) for wrong-current-password and
policy-violation — and the frontend loses nothing, because its field mapper reads `loc` and `msg` only
(`frontend/src/lib/errors.ts`). The rule behind the detail: when a refusal is about a credential, construct
the body deliberately; do not let a framework's convenience shape decide what gets reflected.

### Testing guards without placeholder endpoints — and three async-ORM traps (F031)

`require_permission` and the forced-change gate needed endpoints to guard, and this project does not ship
placeholder production routes. The answer is a **scratch FastAPI app built inside the test file**
(`tests/test_authorization.py::build_scratch_app`): it mounts the *real* dependencies over the *real*
rollback session, on throwaway routes whose only job is to be refused. The `get_session` override that
`conftest.py` applies to the real app is applied to the scratch app the same way — the composition under
test is the same object a future F033 endpoint composes.

Building authorization state in tests surfaced three SQLAlchemy traps, all under asyncio:

- **A collection on a persistent object is not free.** `role.permissions.append(...)` after the role is
  flushed — or `user.roles.append(...)` after the user is — triggers a lazy load, and under asyncio that
  is a `MissingGreenlet`, not a query. Build while pending (`with session.no_autoflush:`) or initialise
  the collection at construction (`User(..., roles=[])`).
- **Expiry is not a clean slate.** `expire_all()` leaves instances whose *next attribute access* loads —
  IO in the middle of an assertion (and a `MissingGreenlet`). To prove "the next request re-reads the
  database", **`expunge_all()`**: it empties the identity map, and the request's `session.get()` loads the
  full graph through the normal selectin chain — exactly what a production request, with its fresh
  session, does.
- **Ids outlive the objects.** Capture `user.id` before expunging/expiring; afterwards, reading it is IO.

The general lesson: in tests, touch ORM attributes only while the objects are loaded, and let the *request*
be the thing that proves re-reads.

### Two frontend lessons from the auth screens (F032)

- **The generated primitives carry no semantics.** `CardTitle`/`CardDescription` render `<div>`s (the
  shadcn convention), so the auth cards — where the card *is* the page — wrap a real `<h1>` inside
  `CardTitle`: assistive technology and role-based test queries both need a heading, and Tailwind's
  preflight keeps the element visually identical. The general rule: when a UI primitive's element is
  cosmetic, add the semantic element yourself rather than asserting on styling.
- **Flow tests need a bigger time budget than unit tests.** `tests/auth/auth-flows.test.tsx` types whole
  passwords keystroke by keystroke and crosses two network round trips per action; on a cold transform
  cache that legitimately exceeds Testing Library's 1 s default, and the failure reads as "the button did
  nothing" — a flake that is nobody's bug is still a bug. The fix is one per-file
  `configure({ asyncUtilTimeout: 3000 })`: Vitest isolates module state per test file, so the raised
  default cannot leak into other suites.

### An UPDATE makes `updated_at` cost IO — and a rollback empties the map (F033)

Two more async-ORM traps, both found while serialising the admin API's responses:

- **`TimestampMixin.updated_at` is a SQL-expression `onupdate`.** After an ORM UPDATE, SQLAlchemy marks
  the attribute *expired* (the database computed it); the response builder's first read of it is a lazy
  refresh — a `MissingGreenlet` in async code. A service that returns a just-updated row therefore
  `await session.refresh(row)` after the commit before anything serialises it
  (`services/users.py::update_user`). In the sync world this was an invisible extra SELECT.
- **A service-level `session.rollback()` empties the identity map for everyone sharing it.** When the
  unique index answers a duplicate email, the service rolls the poisoned transaction back — correct, and
  per-request sessions make it invisible in production. In tests the session is *shared* with the test
  body, so every captured ORM object is expired and the next attribute access is IO. The F031 lesson
  repeats one level up: capture ids before a request that may roll back, and re-read rows with
  `populate_existing` (or `expunge_all`) instead of trusting in-memory state across it.

### A facet count and a server page disagree by construction (F034)

`DataTableFacetedFilter` counts what it can see — the loaded rows. Exact in client mode; a quiet lie in
server mode, where "Active (3)" means three rows on *this page*. The users screen therefore uses the kit's
faceted filter where it belongs (client tables) and a controlled select where the truth lives on the
server. The related test-level lesson, same family as §12's oldest rule (assert the artefact, not the
expectation): Base UI's checkbox renders `<span role="checkbox">` with `aria-disabled`, so jest-dom's
`toBeDisabled()` is false and `toHaveAttribute('aria-disabled', 'true')` is the assertion that means what
it says.

### Assigning a collection reads it first (F035)

`role.permissions = [...]` looks like a pure write. It is not: replacing a *secondary* relationship's
collection requires the old contents — SQLAlchemy loads them to compute the association-table diff. If
the instance came from an identity-map hit whose collection was never loaded, that load happens *inside
the assignment* — a lazy load in async code, which is a `MissingGreenlet`, three frames away from the
line that "only assigns". F035 met both halves of this: the grant-set reads in the matrix save come from
SQL (`_current_codes` — the association table is the truth, the map's memory is not), and every role a
service is about to mutate is fetched through a `populate_existing` getter (`get_role`) so its collection
is loaded *before* anything assigns to it. The general rule is the F031/F033 one, sharpened: before
writing a relationship, make sure reading it is free — or do the reading in SQL. One refinement,
met again in F037: `populate_existing` re-applies the mapper's *default* strategy, and
`Permission.roles` has no `selectin` default (unlike `Role.permissions`) — so a getter that means to
load a collection must say `selectinload(...)` explicitly, or the load still happens inside the
caller's delete.

### Dependency edges met while building the auth stack (F029–F036)

- **Starlette renamed the 422 status constant.** `HTTP_422_UNPROCESSABLE_ENTITY` now emits a
  deprecation warning on every response built with it; `HTTP_422_UNPROCESSABLE_CONTENT` is the
  spelling (F030's endpoint uses it). The suite treats warnings as defects — a deprecation that
  fires per request is exactly the kind of noise that hides the next real one.
- **httpx will not store `Secure` cookies from an `http://` URL.** The test client's cookie jar
  drops the `__Host-` pair a response sets (its `http.cookiejar` policy refuses secure cookies over
  plain http, even for `localhost`), so auth-flow tests either pass cookies explicitly per request
  or set them on the jar (`client.cookies.update(...)`) — never assume the jar kept what the server
  sent. Documented in the F029 test file's header, too.

### The normaliser's fallback is not the only carrier (F036)

`lib/errors.ts` (F018) hides array-shaped 422 details from `ApiError.detail`
on purpose — a validation *array* is not a sentence — substituting "Some of
the submitted values need attention." The specifics live in `fieldErrors`,
and a surface that shows only `detail` (a banner, a save bar) ends up telling
the user less than the server did. The matrix's save bar therefore prefers
the field-error messages when they exist and falls back to the detail string
(403s carry one). The general rule: when a surface is not a form, read
`fieldErrors` yourself before settling for the fallback.

### A dot in a form field name is a path — and `reset` stores verbatim (F040)

The settings form's field names are the registry keys (`branding.app_name`), which is what makes the
server's dotted 422s land without a translation table. The first shape of that form declared a *flat*
zod schema with literal dotted keys — and it validated the **seeded** values while silently ignoring
every **typed** one: React Hook Form resolves a dotted `name` through its path utilities (writes go to
`branding → app_name` on a nested object), while `form.reset(obj)` stores its argument exactly as
given. Two representations, one store, and the symptom was a controlled-looking input whose typing
reached nothing. The fix is to let both sides agree: the schema is **nested** where the names are
dotted, the wire stays flat via an explicit payload builder, and `applyServerErrors`' dotted paths land
on the same nested field paths RHF uses. The general rule: when field names carry structure, make the
schema carry the same structure — mixed representations fail quietly, not loudly.

## 13. Non-goals and deferred choices

- No service worker, offline mode or PWA — "offline" in this project means *network-failure handling*, not
  offline-first.
- No S3, mail server, OAuth/SSO or public signup.
- No microservices, message broker or background worker beyond bounded `BackgroundTasks` or a PostgreSQL
  outbox (§8.4e).
- Session timeouts and password-policy parameters are **initial defaults** here; the concrete values are
  confirmed rather than invented now — **F025 confirmed the session lifetimes**
  (`Settings.session_idle_timeout_minutes` = 720, `session_absolute_lifetime_days` = 30), **F026 the
  password policy** (12–128 characters, denylist, 5 login attempts / 15 minutes — §3), **F027 the
  bootstrap credential policy and the default role catalog** (C15/C16 — §3, §6), **F028 the login
  behaviour that consumes them** (uniform 401/429, the decoy verification, commit-before-raise, the
  account-bucket reset — §3), **F029 the session lifecycle and CSRF enforcement** (rotation inherits
  the absolute deadline, a replayed ID kills its family, logout is idempotent, the origin + double-submit
  rules — C18, §3), **F030 the password-change lifecycle** (current-password proof incl. during the
  forced change, the re-authentication throttle, the one-commit rotate-and-revoke, the admin-reset
  semantics — C19, §3), **F031 the authorization guards** (the union via `effective_permissions`,
  the `is_superuser` expansion as break-glass, the fail-closed dependency defaulting with the auth
  router as the staged exemption list, `require_permission`, `/auth/me` — C20, §6), **F032 the
  session layer in the SPA** (the four-status session provider, the 401 re-resolution handler, the
  CSRF interceptor, the login/forced-change standalone routes and the account menu — C21, §5), **F033
  the admin user directory** (the six guarded endpoints with their privilege rules, soft deletion, and
  the SQL-filtered paginated list — C22, §6), **F034 the users screen** (the first server-mode
  DataTable, the row-actions kit component, the one-time password notice, the permission mirrors —
  C23, §5), **F035 the role API** (the CRUD with the two-way subset rule, the seed-owned
  `is_system` column, deletion refused while assigned, and the validate-everything-then-one-commit
  matrix save — C24, §6), **F036 the matrix screen** (the draft-not-a-form model, the save bar
  as the single failure voice, the read-only protected column, one grant-write path — C25, §5), and
  **F037 the permission dictionary** (the in-use freeze, refused-not-normalised codes, no subset rule
  by design — C26, §5), and **F038 the dictionary screen** (client-mode on the unpaginated list,
  server-sentence refusals, mirrors behind `permissions.manage` — C27, §5), **F039 the settings
  registry** (typed allowlist, defaults for unwritten keys, validate-then-upsert in one commit, SET
  NULL attribution, the deliberately-not-settings list — C28, §5), and **F040 the settings editor**
  (card sections over one atomic save, nested-form-versus-flat-wire, the real-zones datalist,
  consumption deferred with its record — C29, §5/§12).
