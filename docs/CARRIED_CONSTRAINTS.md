# Carried-forward constraints (archival copy)

> **Archival copy.** This file reproduces verbatim §6 ("Gaps and constraints later tasks must honour") of
> `NEXT_PROMPT.md` as it stood before the documentation optimisation. It is preserved so no rule is lost when
> the handoff is condensed. Outdated statements, duplicates and encoding artefacts are kept as they were;
> they are not corrected here.
>
> **Open item:** the jsdom `Select` rendering question (the trigger shows the raw value `site` rather than the
> label `Site`) is still unresolved. It must be confirmed in a real browser when Playwright arrives in **F057**,
> then fixed or dismissed there. See the bullet "One thing needs a real browser to confirm" below.

---

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
- **The viewer's read shapes are the trail's contract (F044, C33):** the list response's
  `actions`/`entity_types` come from the model constants — when F045+ adds a vocabulary entry, run
  the migration and the viewer's filters gain it with zero client changes; do not add sorting beyond
  time, and do not add any mutation to the viewer.
- **Every new mutation owes an audit event (F043, C32):** when a task adds a service mutation,
  call `audit.record` **inside its transaction** (never commit in `record`), with a changed-only
  diff and no credential-shaped keys — the remaining candidates (F049 files, F035's future
  additions) are on that list; **F045's inbox operations are deliberately not** (C34: reading or
  clearing one's own notices is not a change to authority or configuration — do not "fix" the
  absence); the vocabulary constants are on `app/models/audit.py` (a new action is a one-line
  change plus a migration). Request id: services read it via the contextvar —
  never plumb a parameter. The viewer (F044) must stay read-only: do not add update/delete buttons
  or endpoints for the trail.
- **The inbox's rules are F046's contract (F045, C34):** producers call
  `services/notifications.py::notify` **inside their own transaction** (it never commits — the
  notice rides the event that caused it) and only for real events about the *recipient*; never add
  a public create endpoint. The link rule is two-layer and load-bearing — an internal path
  (`^/[A-Za-z0-9]`, ≤ 500, never a URL) enforced at the door *and* by the table's CHECK; do not
  relax either, and F046 renders links through the router. Foreign and stale ids answer **404, never
  403** — a 403 would confirm the id exists; do not "improve" the message. The list carries
  `unread_count` with the page; `GET /unread-count` exists for the bell's poll (it is the
  deliberate cheap path). A delete's repeat-404 is success as far as the UI is concerned (the row
  is gone); clear-all is the confirmed bulk (F019's `ConfirmDialog`). No audit rows for inbox
  operations.
- **The inbox UI's seams are F047's foundation (F046, C35):** the unread number has exactly one
  query key — `queryKeys.notifications.unreadCount(userId)` — and any new reader (F047's dashboard)
  must read **that**, never refetch the endpoint under a private key; notification mutations go
  through `useNotificationMutations` (never a hand-rolled optimistic update); the read/unread
  filter stays a **server parameter**; a notice's `link` renders through the router only; the
  bell's polling belongs to the bell — do not add a second poller for the same count.
  `PageHeader.title` takes a node (string callers unchanged).
- **Profile pages are menu-reached, never nav-listed (F042, C31):** any future personal page follows
  `showInNavigation: false` + `requiredPermissions: []` (the shell's boundary is the gate) and is
  linked from the account menu; the password form stays one component (`ChangePasswordForm`) — never
  fork it; and `MeResponse` grew `created_at` — other consumers may use it.
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

