# REQUIREMENT TRACEABILITY — task F002

Written 2026-10-08. Task: "Map supplied foundation requirements to modules and tasks."
Acceptance: a traceability table with **no domain modules**.

## Sources and method

| Source | Role | Location |
|---|---|---|
| `BIG-PROMPT.txt` | origin of the foundation requirements; 15 sections (§0–§14) | `claude_code_pack\BIG-PROMPT.txt` (verbatim copy, in-repo since 2026-10-10; the archive original at `D:\RESORS_REFERENCE\BIG-PROMPT.txt` is the audit record — never edit either) |
| `PRODUCT_SPEC.md` | authoritative functional contract | `claude_code_pack\PRODUCT_SPEC.md` |
| `TASKS.md` | the ordered backlog this table maps onto | `claude_code_pack\TASKS.md` |
| `CLAUDE_MASTER.md` | non-negotiables and engineering constraints | `claude_code_pack\CLAUDE_MASTER.md` |
| `DECISIONS.md` | open/confirmed decisions | `claude_code_pack\DECISIONS.md` |

Method: every requirement section was read in full and mapped to the Stage A task that will implement it. IDs are
assigned here for reference only (`BP-n` = BIG-PROMPT section, `PS-n` = PRODUCT_SPEC section, `CM` = CLAUDE_MASTER
constraint). Mapping was checked in both directions — see §13 (reverse index) and §14 (gaps).

**Scope:** Stage A foundation only, which is the whole of `BIG-PROMPT.txt` §0–§14 and `PRODUCT_SPEC.md` §2. No
construction-domain module appears anywhere in this document: the domain (`PRODUCT_SPEC.md` §1, §3–§10) is Stage B
and is deliberately absent here, as F002 requires. `BIG-PROMPT.txt` §3.1 is itself a foundation requirement —
"do not port these domain routes" — and is traced as such in §3 below.

## 1. Cross-cutting execution rules — `BIG-PROMPT.txt` §0, §2

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-0.1 | Read the prompt, then inspect the actual reference source | evidence / audit | F001 |
| BP-0.2 | No QTC360 branding; neutral configurable `APP_NAME` | `config/branding.ts`, public assets | F006, F009, F032 |
| BP-0.3 | Preserve features whose utility transcends the domain | auth, admin, audit, notifications, profile, DataTable, dialogs, forms, reports | F020–F053 |
| BP-0.4 | Keep the reference stack where compatible; lock and record exact versions | tooling | F003 |
| BP-0.5 | **Remove Next.js completely** — Vite SPA, React Router | frontend bootstrap | F006, F063 |
| BP-0.6 | **Remove Redis completely** (no image, env, SDK, broker) | compose, backend | F008, F059, F063 |
| BP-0.7 | No public registration; admin-provisioned accounts; one-time bootstrap super-admin | auth/admin | F027, F030, F033 |
| BP-0.8 | Multiple roles per user, union permissions, server-side enforcement | RBAC | F024, F031 |
| BP-0.9 | Every page/API real, with genuine loading/empty/denied/offline/error states | app-wide | F011–F017, F047, F063 |
| BP-0.10 | Phased workflow: migrations, CI, backend + frontend + E2E tests, security baseline, ops docs | app-wide | F023, F055–F062 |
| BP-0.11 | No business rules at this stage; clean extension points for later modules | architecture | F004, F063 |
| BP-0.12 | Improve on the source where it is wrong (security/a11y/reliability over parity) | app-wide | F004, F060 |
| BP-1 | Evidence-backed source map; reinspect locally before building | reference audit | F001 |
| BP-1.1 | 29 source UI primitives + 7 DataTable files + form/loaders/PDF-preview/helpers recreated | `components/ui`, `components/data-table`, `components/form`, `components/loaders` | F011, F012, F013, F014, F015 (Sidebar), F019, F020, F021, F022, F053 |
| BP-1.2 | Visual source characteristics: 64px top bar, 260/64px sidebar, `p-6` main, nav type scale, login composition, motion, keyboard | layout + tokens | F009, F010, F015, F016, F032, F058 |
| BP-2.1 | Frontend library set retained (React, Router, Tailwind 4, base-nova, TanStack, RHF/Zod, Axios, Recharts, DnD Kit, react-pdf) | frontend | F003, F006, F018, F019, F020, F021, F053, F054 |
| BP-2.2 | Backend library set retained (FastAPI, SQLAlchemy 2 async, asyncpg, Pydantic 2, Alembic, uv, pytest) | backend | F003, F007, F023 |
| BP-2.3 | Operations: PostgreSQL, Caddy, Gotenberg, multi-stage Docker, GitHub Actions | ops | F008, F059, F061 |
| BP-2.4 | Executable version discovery; record in `docs/STACK_VERSIONS.md`; no floating tags | tooling | F003 |

## 2. Design system and component packages — `BIG-PROMPT.txt` §5

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-5.1 | CSS-first Tailwind 4 with all semantic tokens, light + dark, OKLCH values from §1.2 | `styles/globals.css` | F009 |
| BP-5.1b | `ThemeProvider`, `ThemeToggle`, `ThemeSelect`, persisted light/dark/system, anti-flash, reduced motion | theme provider | F010 |
| BP-5.1c | shadcn base-nova on `@base-ui/react`, `rsc:false`, Vite + tsconfig aliases | `components.json`, tooling | F006, F009 |
| BP-5.2 | All 29 primitives operative with disabled/busy/validation/focus states | `components/ui/*` | F011–F014 (+ F015 Sidebar, F020 Table) |
| BP-5.2b | Enhanced generic components (`PageHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `StatusBadge`, `ConfirmDialog`, `FormActions`, `PermissionGate`, `SecureLink`, `PaginationBar`, `SearchField`, `FilterChip`, `FileDropzone`, `FilePreview`, `PDFPreviewModal`, `ThemeAwareChart`, `IconButton`, `RelativeTime`, `DateDisplay`, `ActionMenu`, `KeyboardShortcut`) | `components/common/*` + feature modules | F017, F012, F019, F020, F050, F053, F054, F016, F013, F011 |
| BP-5.3 | Enterprise DataTable: server+client pagination, sorting, search, faceted filters, chips, empty state, selection, bulk actions, inline edit, CSV, URL state, virtualization | `components/data-table/*` | F020, F021, F022 |
| BP-5.3b | Column visibility/order persisted per table key in `user_preferences`, per user, reset to defaults | preferences | F048 (API side F041) |
| BP-5.3c | Real usage in `/admin/users`, `/admin/permissions`, `/admin/audit` | admin screens | F034, F038, F044 |
| BP-5.4 | RHF + Zod v4 typed form kit, `aria-invalid`/`aria-describedby`, server error mapping, unsaved-change prompts | `components/form/*` | F019 |
| BP-5.5 | Visual parity snapshots at 1440/900/390 in both themes | visual regression | F058 |

## 3. Exclusions and reusable capabilities — `BIG-PROMPT.txt` §3

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-3.1 | Do **not** port any QTC360 domain route, model, rule, seed, logo, font or credential | negative requirement across the whole foundation | F001 (recorded), F063 (leakage gate), F009/F032 (no borrowed branding) |
| BP-3.2a | Generic optional `WorkspaceContext` extension contract; disabled by default; no inert selector | extension interface + layout slot | F004, F015 |
| BP-3.2b | Generic honest dashboard — no fabricated KPIs | `/dashboard` | F047 |
| BP-3.2c | File/report toolkit as reusable infrastructure with a documented sample | storage + reporting | F049–F053 |
| BP-3.2d | Optional reusable profile signature asset; typed delegation capability interface; **no** signing/approval semantics | profile / architecture | F042, F004 |
| BP-3.2e | CSV/Excel import-export infrastructure with a tested example on a safe entity | DataTable + admin | F022, F048 |
| BP-3.2f | Audit and notification APIs independent of any domain entity | audit / notifications | F043–F046 |
| BP-3.2g | Preserve nav grouping mechanism and layout, no misleading empty links | navigation registry | F016 |

## 4. Page tree, routing, navigation — `BIG-PROMPT.txt` §4

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-4.1 | Public auth layout + protected dashboard layout; `/` redirects by auth state | router | F017, F032 |
| BP-4.2 | `/login`, `/change-password` | auth pages | F032, F030 |
| BP-4.3 | `/dashboard`, `/notifications`, `/profile`, `/profile/security` | user pages | F047, F046, F042 |
| BP-4.4 | `/admin` redirect → `/admin/users` or 403; `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/settings`, `/admin/audit` | admin pages | F017, F034, F036, F038, F040, F044 |
| BP-4.5 | `/tools/components` dev-only, excluded from production navigation | component lab | F054 |
| BP-4.6 | `/403`, `/404`, `/*` not-found; route-level 403 distinct from anonymous redirect | route states | F017, F031 |
| BP-4.7 | Declarative route registry with metadata (`id`, `path`, `label`, `icon`, `group`, `requiredPermissions`, `adminOnly`, `showInNavigation`, `featureFlag`, breadcrumb, lazy component) | `config/navigation.ts` | F016 |
| BP-4.8 | Nav groups Overview/Administration/Future Modules; permitted items only; no fake empty groups; component lab behind dev tooling | navigation | F016, F054 |
| BP-4.9 | Source nav UX: collapsible groups, icon-only rail, tooltips, persisted state, scroll-into-view, mobile drawer, focus management | layout | F015, F016 |
| BP-4.10 | Command palette shares the **same** permission-filtered route registry; Ctrl/Meta+K | command palette | F016 |
| BP-4.11 | SPA fallback: link nav, back/forward, deep-link refresh, hard reload | Caddy / router | F059, F006 |

## 5. Backend architecture, data model, API — `BIG-PROMPT.txt` §8

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-8.1 | Recommended backend layout (`api/v1/*`, `core/*`, `models/*`, `schemas/*`, `services/*`) with DI and typing | backend structure | F005, F007 |
| BP-8.2a | `users`, `roles`, `permissions`, `user_roles`, `role_permissions` with UUIDs, constraints, indexes | models + migration | F023, F024 |
| BP-8.2b | `sessions`/`refresh_tokens` with hashed credential, family/expiry/revocation/replacement | session model | F025 |
| BP-8.2c | `user_preferences` unique `(user_id, key)` JSONB | preferences | F041 |
| BP-8.2d | `app_settings` typed registry, `updated_by`/`updated_at` | settings | F039 |
| BP-8.2e | `notifications` per-user with optional safe internal link | notifications | F045 |
| BP-8.2f | `audit_logs` immutable, timezone-aware, correlation ID, sanitized details | audit | F043 |
| BP-8.2g | `file_assets` metadata (key, filename, content type, size, sha256, category) | files | F049 |
| BP-8.2h | `login_attempts`/rate-limit buckets if DB-backed limiting is implemented | security | F026, F060 |
| BP-8.2i | SQL-level scoping (not Python-side filtering of unrestricted rows); keyset/offset pagination with total; concurrency-safe transactions; idempotent role/permission bootstrap | models/services | F023, F024, F027, F031, F045, F048 |
| BP-8.3 | `/api/v1` surface: health, ready, auth (login/refresh/logout/logout-all/me/change-password/preferences), admin (users, roles, permissions, settings, audit-logs, permission-matrix), notifications (list/unread/read/mark-all/delete/clear), files, reports | API | F007, F028–F053 |
| BP-8.3b | Consistent error shape and 200/201/204/400/401/403/404/409/422/429 semantics; OpenAPI security scheme matching the real cookie/Bearer design | API contract | F018, F028, F031, F056 |
| BP-8.3c | No public `/auth/register`; no arbitrary setting keys written without registry checks | API | F033, F039 |
| BP-8.4a | Migrations apply from empty DB, downgrade where feasible, no drift; one migration per change | Alembic | F023 (then per task) |
| BP-8.4b | Startup config validation; health vs readiness separated; readiness checks PostgreSQL (and Gotenberg where reports require it) | core/config, health | F007, F052, F062 |
| BP-8.4c | Structured logging with request IDs, exception middleware, no PII/token leakage, no `print` | core/logging | F060 |
| BP-8.4d | Explicit transactions, rollback on exception, audit write in the same transaction | services | F043 |
| BP-8.4e | No Redis: bounded `BackgroundTasks` or PostgreSQL outbox — no phantom worker; test it or don't claim it | async work | F008, F063 |

## 6. Identity, authentication, sessions, RBAC, security — `BIG-PROMPT.txt` §6

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-6.1a | `User` fields incl. `is_active`, `is_deleted`, `is_superuser`, `must_change_password`, `password_reset_at`, `token_version`; no domain columns | user model | F024 |
| BP-6.1b | Admin creates accounts with temporary/generated password shown once; forced first-login change; admin reset revokes and forces change | account lifecycle | F027, F030, F033 |
| BP-6.1c | Email canonicalized, unique at DB layer; last-super-admin and self-deletion safeguards; no privilege escalation | RBAC rules | F024, F033, F035 |
| BP-6.1d | Argon2id preferred (bcrypt allowed if justified); configurable policy; never store/return raw or hashed passwords | password security | F026 |
| BP-6.1e | `must_change_password` enforced on all regular endpoints | auth guard | F031 |
| BP-6.2a | Chosen documented session design: short access token + HttpOnly rotating refresh cookie **or** opaque HttpOnly session cookies; PostgreSQL-managed rotation/revocation | session strategy | F004 (decision), F025, F028 |
| BP-6.2b | Login/logout/refresh/me/change-password, disabled-user and version-based revocation | auth API | F028, F029, F030 |
| BP-6.2c | Refresh rotation with hashed rows, absolute expiry, replay/reuse detection, logout-all | session security | F025, F029 |
| BP-6.2d | CSRF mitigation and tight CORS; SameSite tested; TLS in prod | security | F029, F060, F059 |
| BP-6.2e | Single-flight refresh + one retry on the client; no refresh loops; no token in JS/localStorage | API client | F018, F032 |
| BP-6.2f | Redirect to `/login` only after auth resolution; network/5xx get Retry UI; unauthorized shows 403 without data leak; safe intended-destination persistence | auth guard | F017, F032 |
| BP-6.2g | No user enumeration on login failure; DB-backed rate limiting with concurrency tests; security events recorded without secrets | security | F026, F060 |
| BP-6.2h | Do **not** copy the source's `APIRouter.include_router` monkey patch | backend main | F007 |
| BP-6.3a | `Role`/`Permission` M:N, machine-stable permission codes, safe admin CRUD | RBAC | F024, F035, F037 |
| BP-6.3b | Default `super_admin`/`admin`/`viewer` roles seeded idempotently; viewer read-only via explicit permissions (not the source's `{viewer}` shortcut) | seed | F027 |
| BP-6.3c | `get_current_user`/`require_permission`/`require_admin` re-check status and effective permissions, fail closed, filter in SQL | auth deps | F031 |
| BP-6.3d | Route guards and `PermissionGate` are UX only, never the security boundary | frontend + backend | F016, F031 |
| BP-6.3e | Least privilege on role assignment/admin changes; validate unknown IDs; audit every role/permission change with sanitized before/after | RBAC + audit | F035, F037, F043 |
| BP-6.3f | Role changes invalidate sessions or re-evaluate privileges on next request (token_version pattern) | sessions | F029, F031 |
| BP-6.3g | Documented future `ScopePolicy` resource-scope interface — no domain scope masters now | architecture | F004 |
| BP-6.4 | Security baseline: startup validation, parameterized queries, least-privilege DB user, safe errors, body/upload caps, traversal + MIME/magic-byte checks, malware-scan hook, safe headers, CSP, HSTS, redacted structured logs, documented threat model | security | F049, F051, F052, F060 |

## 7. Reusable end-to-end features — `BIG-PROMPT.txt` §7

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-7.1a | Login composition, themed background, neutral brand slot, validation, error mapping, autocomplete | `/login` | F032 |
| BP-7.1b | Mandatory initial/reset change with policy guidance; self-service change in Profile > Security; logout wipes cached privileged state | password UX | F030, F032, F042 |
| BP-7.1c | No public signup/invite/forgotten-password email; admin reset is the recovery path | auth policy | F027, F032 |
| BP-7.2 | `/dashboard`: identity welcome, authorized quick links, real unread count, roles summary, authorized recent activity, real health status, empty states, no fake analytics | dashboard | F047 |
| BP-7.3 | `/admin/users`: full table, create with temp password + role multiselect, edit, reset dialog, deactivate, safeguards, server errors, empty/loading states, audit | admin users | F033, F034 |
| BP-7.4a | `/admin/roles`: permission matrix grouped by namespace, super-admin column read-only, sticky headers, visible unsaved edits, **one atomic save** | role matrix | F035, F036 |
| BP-7.4b | `/admin/permissions`: searchable/sortable dictionary, privileged CRUD, refuse deleting in-use permissions, canonical code validation | permissions | F037, F038 |
| BP-7.4c | 403 UI on direct navigation to restricted pages | route states | F017, F031 |
| BP-7.5 | `/admin/settings`: card sections, typed allowlist key/value in `app_settings`, display name/description, date format options, timezone, notification defaults; secrets outside the DB; audit; persists across restart | settings | F039, F040 |
| BP-7.6 | `/profile` + `/profile/security`: profile card, editable allowed fields, roles, view-only permissions, preferences (`user_preferences` JSONB), cross-user isolation, optional avatar/signature asset, predefined date formats | profile | F041, F042, F048 |
| BP-7.7 | `/notifications`: centered list, unread pill, mark-all, clear-all with confirm, per-item delete, relative timestamps, current-user-only APIs, safe internal links, ~30s polling, empty/loading states, real lifecycle events | notifications | F045, F046 |
| BP-7.8 | `/admin/audit`: immutable log persistence, sortable/filterable viewer, server pagination, detail dialog with redacted diff, no mutation routes for normal admins, transactional writes | audit | F043, F044 |
| BP-7.9a | Storage abstraction: safe path resolution, UUID keys, size/MIME allowlist, SHA-256, metadata row, audit, authorized private serving, no public traversal | files | F049, F050 |
| BP-7.9b | `ReportService`: ReportLab PDF, docxtpl DOCX, Gotenberg conversion, pypdf merge, page metadata, health endpoint, react-pdf preview | reports | F051, F052, F053 |
| BP-7.9c | Real permission-protected sample: "User Directory" PDF (or Application Configuration) drawing only authorized rows | reports | F053 |
| BP-7.9d | CSV/Excel export with formula-injection protection, streaming where appropriate, tested MIME headers, filename sanitation, error cleanup | export | F022 |
| BP-7.9e | Sample report test in CI with Gotenberg healthy | CI | F061 (+ F052, F053) |

## 8. Frontend architecture and extension interfaces — `BIG-PROMPT.txt` §9

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-9.1 | Target frontend structure (`app/`, `config/`, `components/`, `features/`, `pages/`, `hooks/`, `lib/`, `testing/`) | frontend structure | F005, F006 |
| BP-9.2 | Scoped `QueryClient` (~30s stale), global error normalization + Sonner, typed query keys incl. identity, cache reset on logout | providers | F018 |
| BP-9.3 | Axios with relative `/api/v1` (Vite proxy dev, Caddy same-origin prod); no secrets in `VITE_*` | `lib/api.ts` | F018, F006, F059 |
| BP-9.4 | Typed DTOs generated from OpenAPI, drift-checked in CI | API typing | F018, F061 (see gap G-6) |
| BP-9.5 | Next.js removal mechanics (image/link/router/font/config/metadata → Vite equivalents) | frontend | F006 |
| BP-9.6 | Extension interfaces `AppModule`, `ScopePolicy` (backend, Python), `ContextSwitcherAdapter`; no runtime plugin loading of remote code; permissions registered server-side | architecture | F004, F063 |
| BP-9.7 | `docs/ADDING_A_MODULE.md` using a neutral `demo_records` example, kept out of production navigation | docs + test extension | F062, F063 |

## 9. Testing and proof — `BIG-PROMPT.txt` §10

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-10.1 | Backend unit tests: hashing/policy, email normalization, token/expiry/version invalidation, rotation/reuse, permission union, preference serialization, traversal/MIME, audit redaction, pagination/sort/filter parsers, rate limits, report sanitation | pytest | F026, F029, F031, F043, F049, F056 |
| BP-10.2 | Integration tests on real PostgreSQL incl. multi-role 403 immediacy, reset invalidation, atomic role matrix, anti-escalation, preference/notification isolation, PDF validity, Gotenberg-down handling, migration rollback, concurrency, 404/409/422 | pytest + DB | F028–F053 (each), F056 |
| BP-10.3 | Frontend component tests (Vitest + Testing Library + MSW) incl. auth guard states, drawer, command palette, theme persistence, form errors, DataTable prefs/inline edit, single-flight refresh, dark/light | vitest | F011–F022, F032, F046, F055 |
| BP-10.4 | Playwright E2E against real migrated DB covering the 11-step workflow (anonymous redirect → bootstrap → forced change → multi-role → 403s → role edits → table prefs → theme/sidebar/shortcut → notifications isolation → profile/password → PDF + deep links) | playwright | F057 |
| BP-10.5 | CI gates: npm clean install, lint/typecheck, Vitest, Vite build; uv frozen sync, Ruff, pytest, migration smoke; Playwright with compose services; PDF/Gotenberg smoke; audits; coverage ≥85% core with critical auth/RBAC branches | CI | F055, F056, F057, F061 |
| BP-10.6 | Accessibility: axe scans on Login, Dashboard, Admin Users, permission matrix, Notifications; fail CI on critical violations | a11y | F058 |

## 10. Operations, release, required output — `BIG-PROMPT.txt` §11, §14

| Req | Requirement | Module / area | Task(s) |
|---|---|---|---|
| BP-11.1 | Local DX: `docker compose up -d` gives PostgreSQL + Gotenberg; documented uv/npm commands; ports; `.env.example` with safe placeholders only | dev ops | F008, F062 |
| BP-11.2 | Production compose: Caddy + static Vite + backend + postgres + gotenberg, healthchecks, non-root, networks, no Redis/Next, no exposed DB | prod ops | F059 |
| BP-11.3 | Documented one-time migration/init and bootstrap super-admin with operator-supplied credentials; readiness/logs/rollback | ops | F027, F062 |
| BP-11.4 | Backup/restore incl. private uploads, retention, restore smoke test (not claimed until tested) | ops | F062 |
| BP-11.5 | Secrets never baked into images/commits/frontend; production startup fails on weak or placeholder secrets | security/ops | F060, F062 |
| BP-11.6 | CI/CD: separate jobs, optional image publish, guarded deploy, no QTC360 VPS paths/hosts/accounts | CI/CD | F061 |
| BP-11.7 | Config/ops doc set (see §12 below) | docs | F062 (+ F003, F063) |
| BP-14.1 | Working source tree, locks, `.env.example`, migrations, compose, Caddyfile, CI, tests | deliverable | all F0xx |
| BP-14.2 | `docs/REFERENCE_PARITY.md` reference→target matrix with keep/adapt/exclude and reasons | docs | F004, F063 |
| BP-14.3 | `docs/STACK_VERSIONS.md` exact versions + compatibility justification | docs | F003 |
| BP-14.4 | `docs/ROUTES_NAVIGATION.md` screens, permission visibility, route states | docs | F016, F062 |
| BP-14.5 | `docs/SECURITY.md` session strategy, password/permission policy, CSRF, threat model | docs | F060 |
| BP-14.6 | `docs/IMPLEMENTATION_LOG.md` per-phase commands, exit status, test counts, honest limitations | docs | gates (per `TASKS.md` gate text) |
| BP-14.7 | `README.md` clean-machine dev/test/bootstrap/run/build/deploy/backup commands | docs | F062 |
| BP-14.8 | Final completion summary with real output and blockers | deliverable | F063 |

## 11. Phases, gates, definition of done — `BIG-PROMPT.txt` §12, §13

| Req | Requirement | Task(s) |
|---|---|---|
| BP-12-P0 | Phase 0 audit and architecture (§1 paths, `REFERENCE_PARITY.md`, version confirmation, session strategy, route/DB/permission maps) | F001, F002, F003, F004 |
| BP-12-P1 | Phase 1 skeleton + design language; gate **G-A1** (apps boot, build/typecheck/lint, theme and routes work) | F005–F016 |
| BP-12-P2 | Phase 2 DB + auth + RBAC; gate **G-A2** (bootstrap, forced change, multi-role, 401/403, no escalation) | F023–F032 |
| BP-12-P3 | Phase 3 admin + profile + preferences + full DataTable; gate **G-A3** | F033–F042, F048 |
| BP-12-P4 | Phase 4 notifications + files/reports; gate (real notifications, real PDF, Gotenberg failure graceful) | F045, F046, F049–F053 |
| BP-12-P5 | Phase 5 hardening, a11y, mobile, performance, component lab; gate (unit/integration/E2E green, coverage) | F054, F058 |
| BP-12-P6 | Phase 6 release engineering; gate (clean setup, bootstrap, persistence across restart, security holds) | F059–F062 |
| BP-12-P7 | Phase 7 handoff: validate extension contract with a test-only module, then remove/isolate it; gate **G-A4** | F063 |
| BP-13 | Definition of Done checklist (21 items: clean checkout, real data, no Next/Redis, versions locked, 29 primitives, admin lifecycle, RBAC denial, route states, admin screens, prefs, notifications, files/reports, logs/CSRF/scope/audit, all checks green, Caddy prod, docs accurate, honest blockers) | F063 + operator gates |

## 12. Required documents → producing task

`BIG-PROMPT.txt` §11.7 and §14 require these; `TASKS.md` names only `STACK_VERSIONS` (F003) and
`IMPLEMENTATION_LOG.md` (gate text). This table is the mapping F002 exists to produce.

| Document | Owning task | Status |
|---|---|---|
| `README.md` | F062 | named in F062 ("operations docs") |
| `docs/ARCHITECTURE.md` | F004 | named in F004 ("architecture diagram and interfaces") |
| `docs/ROUTES_NAVIGATION.md` | F016 / F062 | implied by F016 registry + F062 docs |
| `docs/STACK_VERSIONS.md` | F003 | explicitly named |
| `docs/SECURITY.md` | F060 | implied by "security hardening" |
| `docs/DEPLOYMENT.md` | F062 | implied |
| `docs/BACKUP_RESTORE.md` | F062 | implied ("backup restore") |
| `docs/ADDING_A_MODULE.md` | F063 | implied by "test extension registry" |
| `docs/TESTING.md` | F062 | assigned 2026-10-08 (formerly gap G-5); F062 owns the §14 document set |
| `docs/REFERENCE_PARITY.md` | F004 | delivered by F004 — see §14 |
| `docs/OPENAPI_CLIENT.md` | F018 | assigned 2026-10-08 (formerly gap G-6); drift check enforced at F061 |
| `docs/IMPLEMENTATION_LOG.md` | operator gates | named in gate text |
| `docs/REPOSITORY_AUDIT.md` | F001 | delivered |
| `docs/REQUIREMENT_TRACEABILITY.md` | F002 | this document |

## 13. Reverse index — Stage A task → requirements

| Task | Requirements served |
|---|---|
| F001 | BP-0.1, BP-1, BP-3.1 |
| F002 | BP-0.1 (traceability of the foundation; this document) |
| F003 | BP-0.4, BP-2.1, BP-2.2, BP-2.4, BP-14.3 |
| F004 | BP-0.11, BP-0.12, BP-6.2a, BP-6.3g, BP-9.6, BP-12-P0, BP-14.2 |
| F005 | BP-8.1, BP-9.1 |
| F006 | BP-0.2, BP-0.5, BP-2.1, BP-5.1c, BP-9.1, BP-9.3, BP-9.5 |
| F007 | BP-2.2, BP-6.2h, BP-8.1, BP-8.3, BP-8.4b |
| F008 | BP-0.6, BP-2.3, BP-8.4e, BP-11.1 |
| F009 | BP-0.2, BP-1.2, BP-5.1, BP-5.1c, BP-3.1 |
| F010 | BP-5.1b, BP-1.2 |
| F011 | BP-5.2, BP-10.3 |
| F012 | BP-5.2, BP-5.2b, BP-1.1, BP-10.3 |
| F013 | BP-5.2, BP-5.2b, BP-10.3 |
| F014 | BP-5.2, BP-5.2b, BP-1.1, BP-10.3 |
| F015 | BP-1.1, BP-1.2, BP-3.2a, BP-4.9 |
| F016 | BP-3.2g, BP-4.7–BP-4.10, BP-6.3d, BP-5.2b |
| F017 | BP-4.1, BP-4.4, BP-4.6, BP-6.2f, BP-7.4c, BP-5.2b |
| F018 | BP-6.2e, BP-8.3b, BP-9.2, BP-9.3, BP-9.4 |
| F019 | BP-5.4, BP-10.3 |
| F020 | BP-5.3, BP-1.1, BP-10.3 |
| F021 | BP-5.3, BP-3.2e, BP-10.3 |
| F022 | BP-3.2e, BP-7.9d, BP-5.3 |
| F023 | BP-0.10, BP-8.2a, BP-8.2i, BP-8.4a, BP-12-P2 |
| F024 | BP-6.1a, BP-6.1c, BP-6.3a, BP-8.2a |
| F025 | BP-6.2a, BP-6.2c, BP-8.2b |
| F026 | BP-6.1d, BP-6.2g, BP-8.2h, BP-10.1 |
| F027 | BP-0.7, BP-6.1b, BP-6.3b, BP-7.1c, BP-11.3, BP-8.2i |
| F028 | BP-6.2b, BP-8.3, BP-10.2 |
| F029 | BP-6.2b–d, BP-6.3f, BP-10.1, BP-10.2 |
| F030 | BP-0.7, BP-6.1b, BP-7.1b, BP-10.2 |
| F031 | BP-0.8, BP-6.1e, BP-6.3c, BP-6.3d, BP-6.3f, BP-10.1 |
| F032 | BP-1.2, BP-4.2, BP-6.2e, BP-6.2f, BP-7.1a–c, BP-10.3 |
| F033 | BP-6.1b, BP-6.1c, BP-7.3, BP-8.3c |
| F034 | BP-5.3c, BP-7.3 |
| F035 | BP-6.3a, BP-6.3e, BP-7.4a |
| F036 | BP-7.4a |
| F037 | BP-6.3a, BP-6.3e, BP-7.4b |
| F038 | BP-5.3c, BP-7.4b |
| F039 | BP-7.5, BP-8.2d, BP-8.3c |
| F040 | BP-7.5 |
| F041 | BP-7.6, BP-8.2c |
| F042 | BP-3.2d, BP-7.6, BP-7.1b |
| F043 | BP-6.3e, BP-7.8, BP-8.2f, BP-8.4d, BP-10.1 |
| F044 | BP-5.3c, BP-7.8 |
| F045 | BP-3.2f, BP-7.7, BP-8.2e, BP-8.2i |
| F046 | BP-7.7, BP-10.3 |
| F047 | BP-3.2b, BP-7.2 |
| F048 | BP-3.2e, BP-5.3b, BP-7.6, BP-8.2i |
| F049 | BP-6.4, BP-7.9a, BP-8.2g, BP-10.1 |
| F050 | BP-7.9a, BP-5.2b |
| F051 | BP-6.4, BP-7.9b |
| F052 | BP-7.9b, BP-8.4b, BP-10.2 |
| F053 | BP-1.1, BP-5.2b, BP-7.9b, BP-7.9c |
| F054 | BP-4.5, BP-4.8, BP-5.2b |
| F055 | BP-0.10, BP-10.3, BP-10.5, BP-12-P5 |
| F056 | BP-8.3b, BP-10.1, BP-10.2, BP-10.5 |
| F057 | BP-10.4, BP-10.5, BP-12-P5 |
| F058 | BP-1.2, BP-5.5, BP-10.6, BP-12-P5 |
| F059 | BP-0.6, BP-2.3, BP-4.11, BP-6.2d, BP-9.3, BP-11.2, BP-12-P6 |
| F060 | BP-0.12, BP-6.2d, BP-6.2g, BP-6.4, BP-8.2h, BP-8.4c, BP-11.5, BP-14.5 |
| F061 | BP-0.10, BP-2.3, BP-7.9e, BP-9.4, BP-10.5, BP-11.6 |
| F062 | BP-8.4b, BP-9.7, BP-11.1, BP-11.3–BP-11.7, BP-14.1, BP-14.4, BP-14.7 |
| F063 | BP-0.5, BP-0.6, BP-0.9, BP-0.11, BP-3.1, BP-8.4e, BP-9.6, BP-9.7, BP-12-P7, BP-13, BP-14.2, BP-14.8 |

All 63 Stage A tasks appear. No Stage B task is referenced.

## 14. Gaps and tracked limitations

Seven items were found not named verbatim in `TASKS.md`; all were assigned owners on 2026-10-08 at the operator's
request, so no mapping gap remains open. `TASKS.md` carries the task-level wording; this table records the
decision. G-8 is a later, different kind of entry — a limitation discovered while implementing a task, recorded
so it is not lost. Only G-8 is open.

| ID | Item | Resolution |
|---|---|---|
| G-1 | Of the 29 primitives, `input-group` was unowned (`sidebar` → F015 and `table` → F020 were already natural) | **F011** — added to its implement list |
| G-2 | The 21 "enhanced generic" components of BP-5.2b were unnamed | Distributed across existing tasks, no new task: **F017** PageHeader/ErrorState/**EmptyState**/**LoadingState**/**StatusBadge** (revised in F012 — these three are composites over the primitives and belong with the other state components); **F019** FormActions **+ ConfirmDialog** (moved here when F013 delivered only the overlay primitives: F019's unsaved-changes prompt is the component's first real consumer, and it now lives in `components/common/confirm-dialog.tsx`); **F020** PaginationBar/SearchField/FilterChip; **F016** PermissionGate/SecureLink; **F050** FileDropzone/FilePreview; **F053** PDFPreviewModal; **F054** ThemeAwareChart; **F011/F014** IconButton/KeyboardShortcut; **F009** RelativeTime/DateDisplay |
| G-3 | `/` and `/admin` redirect routes unowned | **F017** — added to its implement list |
| G-4 | `WorkspaceContext` contract + context-switcher slot unowned | Interface designed in **F004** (`ARCHITECTURE.md` §7); slot hosted by **F015** — added to its implement list |
| G-5 | `docs/TESTING.md` and `docs/REFERENCE_PARITY.md` required by §14 but unowned | REFERENCE_PARITY delivered by **F004**. TESTING.md assigned to **F062**, which owns the §14 document set alongside README, DEPLOYMENT, BACKUP_RESTORE and ADDING_A_MODULE |
| G-6 | OpenAPI typed-client generation + CI drift check appeared only in D084 (Stage B) | **F018** generates the typed DTOs and `docs/OPENAPI_CLIENT.md`; **F061** enforces the drift check in CI — both added to their implement lists |
| G-7 | Optional items unowned | Resolved as decisions, not deferrals: the **S3 adapter interface** is owned by **F049** (interface only, no S3 dependency); the **malware-scan hook** is owned by **F060** as a pluggable no-op; the **delegation capability interface** is already in **F004** (`ScopePolicy`); the **profile signature asset** is **excluded** — its only consumer was the removed domain workflow (`REFERENCE_PARITY.md` §1) |
| G-8 | Accessibility limitation found in F013, **fixed in F014**. Base UI's Tooltip assigns no `id` to its popup and sets no `aria-describedby` on the trigger, so a screen-reader user focused the trigger and heard nothing. | **Resolved in F014.** `tooltip.tsx` now supplies one `useId` per Tooltip through a context; the trigger carries `aria-describedby` and the popup carries the matching `id`, verified in the test suite. The reference dangles while the tooltip is closed — assistive technology ignores an unresolved describedby, so the closed state is unchanged and the open state is now announced. F013's note that a dangling reference would be "worse than the omission" was reconsidered and found over-cautious: it is identical when closed and correct when open. |

## 15. Confirmed constraints that bound every task

- One legal entity, AED only; single `full_name`; no Next.js; no Redis; no public signup; no seeded production
  passwords (`CM`, `DECISIONS.md` C01/C10).
- No fake API responses, KPI figures, inert buttons or placeholder production endpoints (`CM`).
- Migrations for all persistent changes; money as `NUMERIC`/`Decimal`; UTC instants, explicit timezone display
  (`CM`).
- Stage B domain work must not begin during Stage A; the extension points above exist so it can be added later
  without invasive rewrites (`CM`, BP-0.11).
- `DECISIONS.md` O01–O18 are all Stage B concerns; **no Stage A task is blocked by an open decision**.
