# Completion log (historical archive)

> **Historical completion archive.** This file preserves verbatim §7 ("Completed work (newest first)") of
> `NEXT_PROMPT.md` as it stood before the documentation optimisation. The original content is kept exactly,
> including task records, commands, tables, historical notes, duplicates, encoding artefacts and statements
> that have since been superseded.
>
> **Current task status is maintained in `NEXT_PROMPT.md`.** Do not treat this log as the source of the current
> position or the next task.

---

## 7. Completed work (newest first)

- **F046 — Notifications UI.** The inbox screen and the header bell (§7.7's screen, BP-4.3's route),
  consuming C34's endpoints. `/notifications` (Overview group, `notifications.read` — registered, so
  the sidebar and palette list it) ports the source's list pattern: a narrow centered column, the
  unread count as a pill beside the title (`PageHeader.title` widened to a node for it), mark-all
  and the confirmed clear-all at the upper right, cards with a primary-tinted left accent while
  unread, **relative timestamps via `Intl.RelativeTimeFormat`** (the browser's own phrasing — no
  hand-kept table, the C29 principle), a height-collapse **exit animation** on per-item delete
  (~200 ms before the request fires), empty/loading/error states, and All/Unread/Read tabs. **One
  honest pull-forward** (C35): F045's list gained an `is_read` filter — the tabs are **server
  parameters**, because a client-side filter over a server page would quietly lie about the page
  and its `total` (C23's lesson, applied beyond tables), while `unread_count` stays the account's
  global number whatever the tab shows; the pill and the bell badge read the **same `unreadCount`
  query key**, so two readers of one number cannot disagree. **The bell** — the header control F015
  deliberately withheld — polls that key every ~30 s (TanStack `refetchInterval`;
  `refetchIntervalInBackground` defaults false, so a hidden tab stops polling), renders nothing
  without `notifications.read`, and mounts its polling half only for a signed-in permitted caller
  (no QueryClient is touched before that — which keeps anonymous route-state tests provider-free).
  **Every mutation is optimistic with rollback** (one mechanism in `hooks/use-notifications.ts`:
  snapshot → edit → restore on error → invalidate on settle); in the Unread tab a marked card
  leaves the list — the same edit the server would make — and a failed write pops the rows back
  with the query layer's toast. Links navigate **through the router** (F045's stored path is
  internal by a two-layer rule, so in-app navigation is structural, never a raw anchor). The four
  shell-mounting test files gained the bell's unread-count handler. Checks run: `pnpm run typecheck`
  clean; `pnpm exec vitest run` **498 passed** (13 new in `tests/notifications/notifications.test.tsx`,
  verified across cold-cache runs); `pnpm run build` succeeds; backend **246 passed** (1 new filter
  test); `ruff`/`format`/`mypy` clean; `openapi.json` + generated types regenerated. One latent
  defect surfaced and was fixed en route: F040's settings test asserted the seeded value in the same
  tick its label appeared — a race a cold cache exposed (the page renders the form before the
  snapshot lands, then seeds via one `reset`); the assertion now waits for the seed. DECISIONS C35.
- **F045 — Notifications backend.** The per-user inbox (§8.2; §7.7's API half), shaped so the
  acceptance — "cross-user denial tests" — is a property of the SQL rather than of remembering to
  check. `notifications` (**migration `0008`**, applied to `app_dev`) carries title, message, an
  optional link, `is_read` and timestamps, with `ON DELETE CASCADE` from the user — an inbox is
  personal data with no audit value (the F041 preference edge, not the trail's SET NULL).
  **Two audiences, one table** (C34): producers call `services/notifications.py::notify`, which
  *adds* a row to the caller's transaction and **never commits** — the notice rides the
  transaction of the event it announces (F043's discipline) — and **no public create endpoint
  exists**, because "notify me about things I did" is not a feature and a create route would be a
  spam relay for one's own inbox. Readers are six endpoints under `/api/v1/notifications` behind
  the C16-seeded codes (`notifications.read` for the list and count, `notifications.manage_own`
  for mutations): the list is F033-shaped (newest-first with an `id` tiebreaker,
  `{items, total, unread_count, page, page_size}` — the bell and the page are one request);
  `GET /unread-count` is the deliberately cheap path F046's ~30 s polling uses; `POST /{id}/read`
  answers 200 with the item, idempotent for the owner; `POST /read-all` and `DELETE ""` (clear
  all) report `{updated}`/`{deleted}`; and `DELETE /{id}` is 204 while its repeat is a **404 —
  the same 404 a foreign id gets**, because `(id AND user_id)` is one SQL filter and a 403 would
  confirm the id exists (the same reasoning keeps bulk operations scoped). **The link is a path,
  not a URL**: `^/[A-Za-z0-9]` is enforced at the door *and* pinned by the table's CHECK — the
  strict head closes `//host`, `/\host` and percent-decode tricks — because an inbox that could
  store a URL would be an open redirect for every future producer (F046 renders links through
  the router). **No audit rows** for inbox operations — not administrative mutations — and **one
  honest producer ships**: the admin password reset notifies its target inside the reset's own
  transaction (tested end to end, including the forced change that gates the inbox until the
  target sets their own password). Checks run: `uv run pytest` **245 passed** (9 new in
  `tests/test_notifications.py`); `ruff check`/`format --check` clean; `mypy app migrations`
  clean (65 files); **migration `0008`** applied to `app_dev`; `openapi.json` + generated
  frontend types regenerated (frontend suite unchanged: 485). DECISIONS C34.
- **F044 — Audit viewer.** The trail's read side, shaped by what a trail *is* (C33). `GET
  /api/v1/admin/audit` (`audit.read`) uses F033's pagination shape with a **fixed newest-first order
  and an `id` tiebreaker** — chronological data has nothing to sort it by other than time, so the
  viewer offers no sort buttons and nothing to mislead with. The filters run in SQL: `action` and
  `entity_type` are **validated against the model's vocabularies** (an unknown value is a 422 that
  names the allowed set — a filter silently matching nothing would be a lie), `search` is an escaped
  ILIKE over summaries and the frozen actor email, and `since`/`until` bound the timeline. The
  response **carries the vocabularies themselves** (`actions`, `entity_types`), so the screen's
  filter options come from the server's own constants instead of a hand-kept client copy that could
  drift the first time F045+ adds an action. The item carries **everything the modal needs** —
  `details` and `correlation_id` included — so there is deliberately no `GET /{id}`: a detail
  endpoint would exist only to re-fetch what the list just sent. The screen (`/admin/audit`,
  `audit.read` + `adminOnly`, FileText icon) is F034/C23's server-mode shape — no faceted filter, the
  action/entity selects fed by the response vocabulary, a Period select turning into `since` at
  request time, search and pagination as parameters. **It renders nothing mutable:** the trail has no
  write path, so a disabled button would pretend there could be one. The detail modal shows
  `before`/`after` as a two-column diff, the matrix/settings `changes` shape per key, or formatted
  JSON; the correlation id renders in mono (or "— (no request)" for service-level events). Checks
  run: `uv run pytest` **236 passed** (6 new in `tests/test_admin_audit.py`); `pnpm run typecheck`
  clean; `pnpm exec vitest run` **485 passed** (5 new in `tests/admin/audit.test.tsx`); `pnpm run
  build` succeeds; `ruff`/`mypy` clean; no migration; `openapi.json` + generated types regenerated.
- **F043 — Audit storage.** The append-only trail (C32), and the backfill that finally gives every
  administrative mutation a story. `audit_logs` (**migration `0007`**) is append-only *by
  construction*: `created_at` and no `updated_at` — there is no update path — and no mutation routes
  will ever exist for it (F044's viewer is read-only because there is nothing else it could be).
  **Atomicity is a property of one transaction**: `services/audit.record` *adds* a row to the
  caller's session and never commits, so the mutation's commit carries the event — the duplicate-
  email 409 rolls its pending event back with the failed insert, and an event cannot exist without
  its change; the acceptance tests attack the property from both sides. **Attribution is
  self-contained**: `user_id` FK SET NULL (the trail outlives the account) *plus* a frozen
  `actor_email` snapshot — and the snapshot proved its worth inside the suite itself, cleaning up
  rows a restart test had genuinely committed (§12 now records that leak). **Redacted at the door**:
  `record` refuses credential-shaped keys recursively (case-insensitive; the password/token/secret
  family) with an in-transaction error rather than a leaked row, and the callers' diffs are
  changed-only — the reset-password event names the account and never the temporary, preference
  events carry the key and never the personal value, matrix and settings saves are **one event per
  save** with per-role/per-key before/after. Vocabulary (`AUDIT_ACTIONS`/`AUDIT_ENTITY_TYPES`) lives
  on the model with CHECKs and is validated at the door too. **The request id**:
  `RequestContextMiddleware` accepts a well-formed `X-Request-Id` (constrained —
  `[A-Za-z0-9._-]{1,64}`; hostile values are replaced, never reflected), generates a UUID
  otherwise, exposes it by contextvar (what `record` stores — NULL outside a request, because "no
  request" is a fact) and echoes it on every response: the header `lib/errors.ts` already surfaces
  on `ApiError`. Session lifecycle events deliberately stay on the sessions rows (their own
  append-by-reason record). The **backfill** was surgical — record calls inside F033/F035/F037/F039/
  F041's existing transactions, zero behaviour change — and one real integration bug surfaced on the
  way (the F039 restart test's own-connection commit now writes an audit row; its cleanup owns it
  now, and the frozen `actor_email` made the fix exact). Checks run: `uv run pytest` **230 passed**
  (10 new in `tests/test_audit.py`); `ruff check`/`format --check` clean; `mypy app migrations`
  clean (58 files); **migration `0007`** applied to `app_dev`, chain round-trip clean on `app_test`;
  `openapi.json` unchanged (no new routes — no drift).
- **F042 — Profile UI.** The two profile pages (C31). `/profile` renders three cards: **Details** —
  full name and phone editable through F041's `PATCH /auth/me`, seeded from the session and saved
  through `auth.refresh()` so the header menu moves with the change; email rendered read-only with
  the reason in prose (admin-managed, §7.3); member-since from the new `MeResponse.created_at`
  (added this task — additive, tested); roles as badges; an **Active badge that is
  truthful-by-construction** rather than a served field (a disabled account's session never
  resolves, F029 — the decoration F031 refused to serve). **Security** — a CTA into
  `/profile/security`. **Effective permissions** — the server's current union, grouped by namespace
  the way the matrix groups rows, view-only (a permission you could toggle here would be a role edit
  in costume). `/profile/security` reuses F032's password form — extracted as
  **`ChangePasswordForm`** so the forced flow and this page cannot drift on inputs, guidance or
  422-mapping; only the wrappers differ (shell-less screen with its sign-out escape vs card with
  toast-and-stay). Both routes register with `showInNavigation: false` and no permission
  requirement — profile is not an admin surface, the shell's session boundary is the gate — and the
  account menu's **Profile** item, which F032 deliberately left unlinked, is now wired, with
  Change password re-pointed to `/profile/security` (the standalone `/change-password` stays the
  forced flow's landing). F032's forced-change redirect outranks both routes (tested). Checks run:
  `pnpm run typecheck` clean; `pnpm exec vitest run` **480 passed** (8 new in
  `tests/profile/profile.test.tsx`); `pnpm run build` succeeds; backend **220 passed** (the
  `created_at` addition covered); `openapi.json` + generated types regenerated.
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

