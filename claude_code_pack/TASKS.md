# ORDERED MICRO-TASK BACKLOG

Each task is a **single Claude Code invocation**. Implement exactly one ID and stop. Expected size: a narrow change set, generally one concern and its tests. If a task grows beyond roughly 3–6 files or cannot be finished in a focused session, split it before coding. Task `proof` is the minimum acceptance criterion; relevant security/error/empty states and audit requirements from `PRODUCT_SPEC.md` still apply.

## Stage A — domain-neutral foundation (F001–F063)

### F001 — Repository audit and availability
**Implement:** Check workspace, locate QTC360 ZIP and inspect only if present.
**Accept:** Evidence inventory and missing-reference note. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F002 — Requirement traceability
**Implement:** Map supplied foundation requirements to modules and tasks.
**Accept:** Traceability table with no domain modules. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F003 — Stack verification
**Implement:** Query installed/registry stable versions and compatibility.
**Accept:** Exact versions and evidence in STACK_VERSIONS. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F004 — Architecture decisions
**Implement:** Document SPA/API/session approach and extension boundaries.
**Accept:** Architecture diagram and interfaces. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F005 — Repository structure
**Implement:** Create frontend/backend/docs skeleton and ignore rules.
**Accept:** Expected folders and clean git status. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F006 — Frontend bootstrap
**Implement:** Vite React TS strict Router and basic scripts.
**Accept:** Vite starts and TS passes. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F007 — Backend bootstrap
**Implement:** FastAPI uv config health endpoint.
**Accept:** API starts and health responds. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F008 — PostgreSQL dev services
**Implement:** Compose Postgres and env example, no Redis.
**Accept:** Healthy DB and safe placeholders. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F009 — Theme token system
**Implement:** Tailwind CSS 4 OKLCH tokens and dark mode.
**Accept:** Light/dark tokens render. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F010 — Theme preference provider
**Implement:** Light/dark/system with first-paint persistence.
**Accept:** Theme survives reload. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F011 — Basic UI primitives A
**Implement:** Button Badge Input InputGroup Label Textarea Checkbox Switch.
**Accept:** Component tests for variants. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F012 — Basic UI primitives B
**Implement:** Card Separator Skeleton Spinner Progress Avatar Breadcrumb.
**Accept:** Component tests for rendering. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F013 — Overlay primitives
**Implement:** Dialog Dropdown Popover Tooltip Sheet Scroll Area.
**Accept:** Focus and escape tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F014 — Picker and command primitives
**Implement:** Select Date Picker Time Picker Tabs Collapsible Command.
**Accept:** Keyboard/accessibility tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F015 — Layout shell
**Implement:** 64px header, 260/64px sidebar, mobile drawer, and the disabled-by-default context-switcher slot (interface defined in ARCHITECTURE §7).
**Accept:** Three responsive widths work. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F016 — Navigation registry
**Implement:** Permission-ready declarative nav breadcrumbs and command palette.
**Accept:** Shared route registry and navigation tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F017 — Error and route states
**Implement:** Root (`/`) and `/admin` redirects, 403, 404, error boundary, offline retry and protected placeholder.
**Accept:** Distinct states demonstrated. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F018 — API client foundation
**Implement:** Axios error normalization, Query provider, and typed DTOs generated from the FastAPI OpenAPI schema with `docs/OPENAPI_CLIENT.md` (drift check wired in F061).
**Accept:** MSW client tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F019 — Form framework
**Implement:** RHF Zod fields and server error mapping.
**Accept:** Validation and accessibility tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F020 — DataTable core
**Implement:** TanStack sorting search pagination server mode.
**Accept:** Real fixture tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F021 — DataTable preferences
**Implement:** Column visibility order persistence abstraction.
**Accept:** Reload and isolation tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F022 — DataTable import export
**Implement:** Safe CSV template/export/import validation hooks.
**Accept:** Formula injection tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F023 — Database base migration
**Implement:** Alembic async setup UUID timestamps conventions.
**Accept:** Fresh migration applies. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F024 — User RBAC models
**Implement:** Users roles permissions and join tables.
**Accept:** Unique and FK constraints tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F025 — Session data model
**Implement:** Postgres-backed `sessions` table — hashed session ID, family, expiry, revocation, replacement (DECISIONS C12: no refresh tokens, no JWT).
**Accept:** Migration and revocation model tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F026 — Password security
**Implement:** Argon2id policy hash verification and rate limit primitives.
**Accept:** Unit tests no plaintext. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F027 — Admin bootstrap
**Implement:** One-time safe CLI super-admin and idempotent role seed.
**Accept:** No default credentials tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F028 — Authentication login
**Implement:** Login endpoint and session issuance.
**Accept:** Real DB integration tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F029 — Session rotation and logout
**Implement:** Session rotation, superseded-session-ID replay detection (revoke the family), logout and logout-all, CSRF policy. No refresh endpoint exists (DECISIONS C12).
**Accept:** Session security tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F030 — Password change lifecycle
**Implement:** Forced first login self-change and admin reset.
**Accept:** Old sessions invalid tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F031 — Permission guards
**Implement:** Multi-role union and server-side permission dependencies.
**Accept:** 403 and role union tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F032 — Auth frontend
**Implement:** Login guard, session-renewal handling, forced-change and logout flows.
**Accept:** Browser auth flow test. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F033 — Admin user API
**Implement:** Create list update deactivate with paging and scope.
**Accept:** CRUD and privilege tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F034 — Admin users UI
**Implement:** Users table dialogs multi-role editing and reset.
**Accept:** UI/API integration tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F035 — Role API
**Implement:** Role CRUD and protected atomic permission matrix.
**Accept:** Rollback and escalation tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F036 — Role matrix UI
**Implement:** Permission matrix with one atomic save.
**Accept:** Save/reload/error tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F037 — Permission API
**Implement:** Permission dictionary CRUD guardrails.
**Accept:** Duplicate/in-use tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F038 — Permissions UI
**Implement:** Searchable permission table and dialogs.
**Accept:** CRUD UI tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F039 — Settings backend
**Implement:** Typed allowlist settings persistent API audit.
**Accept:** Restart persistence tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F040 — Settings UI
**Implement:** Card sections name/date/timezone settings.
**Accept:** Validation/reload tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F041 — Profile API
**Implement:** Own profile and preferences API with isolation.
**Accept:** Cross-user access denied. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F042 — Profile UI
**Implement:** Profile and security page with editable allowed fields.
**Accept:** Save/error tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F043 — Audit storage
**Implement:** Immutable audit events redacted diff and request ID.
**Accept:** Mutation/audit atomicity tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F044 — Audit viewer
**Implement:** Paginated filters detail modal authorization.
**Accept:** Admin-only UI tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F045 — Notifications backend
**Implement:** Per-user CRUD read/clear/count and safe links.
**Accept:** Cross-user denial tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F046 — Notifications UI
**Implement:** Inbox bell count mark/delete clear and polling.
**Accept:** UI state tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F047 — Dashboard
**Implement:** Real identity notifications and authorized quick links.
**Accept:** No fabricated stats. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F048 — Table prefs integration
**Implement:** Wire server-stored preferences to real admin tables.
**Accept:** Cross-account reload tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F049 — Private storage core
**Implement:** UUID keys, MIME checks, private volume, metadata, plus a storage adapter interface so a future S3 backend can be added without adding S3 (BP-7.9a).
**Accept:** Traversal and MIME tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F050 — Files API
**Implement:** Authorized upload/download/delete to real generic resource.
**Accept:** Cross-user/file tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F051 — PDF engine
**Implement:** ReportLab sample PDF and pypdf merge.
**Accept:** Generated PDF parses. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F052 — DOCX conversion
**Implement:** Gotenberg adapter and safe sample DOCX conversion.
**Accept:** Healthy/unavailable tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F053 — User directory report
**Implement:** Admin-only real PDF export and preview UI.
**Accept:** Valid data-scoped PDF test. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F054 — Frontend component lab
**Implement:** Dev-only primitives and chart examples.
**Accept:** Excluded from production nav. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F055 — Frontend quality gate
**Implement:** Lint format typecheck Vitest coverage.
**Accept:** Recorded actual results. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F056 — Backend quality gate
**Implement:** Ruff typing pytest Postgres integration coverage.
**Accept:** Recorded actual results. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F057 — Browser E2E
**Implement:** Playwright auth/admin/theme/notification/report flows.
**Accept:** Real DB browser tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F058 — Accessibility and visuals
**Implement:** Axe and responsive light/dark screenshot baselines.
**Accept:** No critical violations. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F059 — Production Docker
**Implement:** Static Vite Caddy FastAPI Postgres Gotenberg.
**Accept:** Production compose boots. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F060 — Security hardening
**Implement:** CSP, CSRF, rate limit, secrets, logging, upload caps, and a pluggable malware-scan hook (no-op default, no new dependency).
**Accept:** Threat-model checks. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F061 — CI workflows
**Implement:** pnpm uv Postgres Playwright build security audits.
**Accept:** Workflow jobs defined and checked. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F062 — Operations docs
**Implement:** Bootstrap, migrations, deploy, backup/restore and recovery, plus the README and the §14 document set including `docs/TESTING.md` and `docs/ADDING_A_MODULE.md`.
**Accept:** Clean operator runbook. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F063 — Foundation handoff
**Implement:** Test extension registry and no domain leakage.
**Accept:** Foundation gate report and no Next/Redis. **Handoff:** list changed files, focused checks, operator checks, and stop.

## Stage A repairs — outstanding findings from the foundation (F064–F065)

Two items the foundation recorded as open and deliberately unowned. They are repairs to Stage A, not domain work, which is why they are numbered here and not in Stage B (C59).

### F064 — Roles screen save-state fix
**Implement:** Fix the F057 finding in `pages/admin/roles.tsx`: `saveMutation.onSuccess` re-seeds the draft from the cache entry that was current *before* the request, so a successful save can leave the save bar showing an unsaved change and the just-saved cell rendering its old value (the grant itself is persisted — verified in `app_e2e`). Re-seed from the mutation's own result instead.
**Accept:** A regression test proving that a successful grant save clears the unsaved-change state and renders the saved value. Applies to the roles screen only. **Handoff:** list changed files, focused checks, operator checks, and stop.

### F065 — Readiness probe
**Implement:** Add the readiness endpoint ARCHITECTURE §10 names (`/ready`; `/health` stays liveness): report PostgreSQL reachability plus each optional dependency's health — `conversion.health()` (F052) for the Word half and `reports.self_test()` (F051) for the PDF engine — as one per-dependency answer, degraded rather than failed when an optional half is down. Not public.
**Accept:** Readiness distinguishes "serving" from "alive", a down optional dependency is degraded and not a crash, and the endpoint's own tests cover both. Closes G-9 and retires the "unbuilt" notes in `health.py`, C40, C41, ARCHITECTURE §10, DEPLOYMENT.md and FOUNDATION_REPORT. **Handoff:** list changed files, focused checks, operator checks, and stop.

## Stage B — construction manpower application (D001–D091)

### D001 — Domain architecture map
**Implement:** Create domain module boundaries schema and permission map.
**Accept:** ERD and action/scope matrix. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D002 — Disciplines migration
**Implement:** Add discipline master with seven initial codes.
**Accept:** Idempotent seed tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D003 — Departments migration
**Implement:** Department master Head Office/Site classification.
**Accept:** Constraints tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D004 — Designations migration
**Implement:** Designation references department and discipline.
**Accept:** FK and uniqueness tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D005 — Master CRUD backend
**Implement:** Protected disciplines departments designations API.
**Accept:** Scoped CRUD tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D006 — Master data UI
**Implement:** Responsive tables/forms for three masters.
**Accept:** Functional create/edit tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D007 — Projects migration
**Implement:** Project code status start contract/forecast dates.
**Accept:** Date/status constraints. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D008 — Projects API
**Implement:** CRUD tender/awarded status and responsible person.
**Accept:** Status permission tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D009 — Projects UI
**Implement:** Project list details and status controls.
**Accept:** Real API integration tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D010 — Head Office cost centre
**Implement:** Cost-centre schema and Head Office seed.
**Accept:** Project/HO distinct tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D011 — Employees migration
**Implement:** Employee ID full_name designation status.
**Accept:** No split name tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D012 — Employees API
**Implement:** Protected CRUD and search.
**Accept:** Sensitive field scope tests, including that **rate fields are absent from the response** for a caller without `rates.read` — absent, not hidden in the client (C58). **Handoff:** list changed files, focused checks, operator checks, and stop.

### D013 — Employees UI
**Implement:** Search filters import-ready forms.
**Accept:** Real employee flow. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D014 — Designation rate history
**Implement:** Effective-dated designation AED/hour rates.
**Accept:** Historical lookup tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D015 — Employee rate history
**Implement:** Effective-dated override rates.
**Accept:** Precedence lookup tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D016 — Rates API
**Implement:** Protected rate history editing no overlaps; every `effective_from` is a month's first day, so a late correction is **back-dated to that month's 1st** rather than dated mid-month.
**Accept:** Unauthorized and overlap tests, plus month-boundary effective-date and audited-back-dating tests (C55). **Handoff:** list changed files, focused checks, operator checks, and stop.

### D017 — Rates UI
**Implement:** Rate grids history effective-date editor.
**Accept:** History visible and secured. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D018 — Master Excel import
**Implement:** Templates validation preview atomic import.
**Accept:** Bad row rollback tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D019 — Project responsibility
**Implement:** Link authorized users to projects and responsible person.
**Accept:** SQL-level scope tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D020 — Tender matrix layout
**Implement:** Project selector site dept/designation row builder.
**Accept:** Duplicate designation row tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D021 — Tender positions persistence
**Implement:** Stable row IDs dates order and duplicate rows.
**Accept:** CRUD and constraints tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D022 — Partial-month month-fraction helper
**Implement:** Partial-month fraction as **the month's calendar days divided into the daily cost** — no working-day calendar, no holiday table, no 26/27-day cap (C55, O01). Every day counts, Sundays and holidays included.
**Accept:** Boundary, leap and short-month tests proving a day is worth more in a 28-day month than a 31-day one. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D023 — Forecast cell defaults
**Implement:** Generate 100% or partial month default percentages, capped at 100 — overtime is a separate row, never a cell above 100 (C55, O03).
**Accept:** Deterministic cells tests, plus a 0–100 CHECK refusal test. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D024 — Manual cell overrides
**Implement:** Persist explicit overrides with source flags.
**Accept:** Save/reload exact values tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D025 — Forecast cost engine
**Implement:** 208h Decimal cost with effective-dated rates.
**Accept:** Exact AED arithmetic tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D026 — Date change reconciliation
**Implement:** Keep edited in-range cells drop out-of-range default new.
**Accept:** Property tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D027 — Bulk date assignment
**Implement:** Multi-row period edit and validation.
**Accept:** Atomic update tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D028 — Tender Excel template
**Implement:** Download template and preview upload.
**Accept:** Column/date validation tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D029 — Forecast revision storage
**Implement:** Revision 0 and draft/publish schema policy.
**Accept:** Concurrency revision tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D030 — Revision UI
**Implement:** Create new Revision checkbox history compare.
**Accept:** Explicit revision action tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D031 — Revision snapshot fidelity
**Implement:** Immutable published rows rates and cost snapshots.
**Accept:** Old revision unchanged tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D032 — Tender monthly totals
**Implement:** Aggregate cost/FTE by month department discipline.
**Accept:** Known fixture totals. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D033 — Award conversion service
**Implement:** Tender-to-awarded transition with no duplicate identity: **create the awarded project, select the project code from the tender list, copy the tender's positions and dates into the awarded forecast as revision 0, and retire the tender row** — it is kept as history and the code stays unique among live projects (C57, O15). Cost Control runs it.
**Accept:** Explicit preview test, plus a test that an awarded tender cannot be awarded twice. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D034 — Award conversion UI
**Implement:** Review/copy tender rows into the awarded draft, with the code selected from the tender dropdown and the **awarded forecast horizon defaulting to the project's last month + 2** (C57, O17).
**Accept:** No silent overwrite test and horizon-default test. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D035 — Awarded position editor
**Implement:** Named/unnamed employees and vacant slots.
**Accept:** Mixed row and conflicts tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D036 — Awarded Excel import
**Implement:** Bulk employee/designation/date upload preview.
**Accept:** Atomic import tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D037 — Forecast report data
**Implement:** Scoped A3/A4 matrix payload and total calculations, in the **two variants of C58**: the administrator's carries rates and per-position (and per-entry) monthly cost, the one Cost Control and PM/PD receive is redacted to project-month totals.
**Accept:** Cross-project denial tests and a redaction test proving the protected figures never reach a non-administrator's payload. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D038 — Tender executive PDF
**Implement:** A3 landscape printable multi-page tender report — the administrator's variant, which is a tender-phase artifact (C58).
**Accept:** PDF content/page tests and an administrator-only test, since a tender is invisible to everyone else (C57). **Handoff:** list changed files, focused checks, operator checks, and stop.

### D039 — Awarded executive PDF
**Implement:** Named/vacant cost and revision report, **redacted to project-month totals for Cost Control and PM/PD** (C58).
**Accept:** Confidentiality tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D040 — Actual assignment schema
**Implement:** Effective-dated employee/project/HO assignments: `end_date NOT NULL` and inclusive at both ends, **one assignment per employee at a time, no `assignment_shares`** (C53).
**Accept:** Interval constraint tests, including the exclusion constraint over `daterange(start_date, end_date, '[]')` that rejects an overlapping pair. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D041 — Assignment end-date alerts
**Implement:** **Withdrawn as written** (C53 answered O07 against the provisional-end option — there is no nullable end date). What this task owns instead is the **assignments-past-end exception list** with its **extend** and **release** actions: a standing warning to the PM/PD, the administrator and Cost Control, while the cost keeps accruing to the project and the person is not shown available. Notices are configurable (D083a).
**Accept:** Tests that a past-end assignment keeps charging until extended or released, and that neither action overwrites the planned end date. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D042 — Assignment authorization
**Implement:** Resource Manager and project responsible edit boundaries.
**Accept:** Negative scope tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D043 — Assignment UI
**Implement:** Employee assignment timeline and end-date editor.
**Accept:** Current allocation visible. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D044 — Transfer request schema
**Implement:** Source/destination/effective dates status audit.
**Accept:** Valid transition tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D045 — Transfer request API
**Implement:** Initiate by Resource Manager or requesting project owner.
**Accept:** Permission and validation tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D046 — Transfer approval API
**Implement:** Actual source responsible person approves.
**Accept:** Wrong approver denied tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D047 — Transfer transaction
**Implement:** Atomic close/source and open/destination intervals: the effective date `T` is the destination's **first** day and sets the source's **effective** end to `T − 1`, while the source's **planned** end is preserved (C53, O12). A transfer is never blocked; a late one warns and an early one notifies.
**Accept:** Concurrent approval tests, plus overflow/fill tests proving no day is charged twice and none is skipped. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D048 — Transfer UI
**Implement:** Request review approve reject timeline.
**Accept:** Full request flow tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D049 — Transfer PDF
**Implement:** Formal request approval and transfer record.
**Accept:** Audited valid PDF tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D050 — Shared assignment schema — WITHDRAWN
**Withdrawn 2026-10-10 by C53** (O06 answered *no* to split assignments): one employee is on one project at a time, so there are no percentage slices and no `assignment_shares` table. The number is kept rather than reused, so references to it stay stable. **Handoff:** nothing to run; the task is closed as withdrawn.

### D051 — Shared allocation engine — WITHDRAWN
**Withdrawn 2026-10-10 by C53.** No daily shares exist to compute; the day-cost arithmetic lives in **D055** (`rate × 208` ÷ the month's calendar days) and the continuity rule in **D058**. **Handoff:** nothing to run; the task is closed as withdrawn.

### D052 — Shared assignment API — WITHDRAWN
**Withdrawn 2026-10-10 by C53.** Assignment create/edit is D042 and the transfer path is D045–D047; nothing here survives. **Handoff:** nothing to run; the task is closed as withdrawn.

### D053 — Shared allocation UI — WITHDRAWN
**Withdrawn 2026-10-10 by C53.** Assignment editing is D043 and transfer UI is D048. **Handoff:** nothing to run; the task is closed as withdrawn.

### D054 — Actual rate time slicing
**Implement:** Apply effective employee/designation rates to date intervals — the only slice that exists is a **month boundary**, because a rate change is effective on a month's 1st (C55, O02).
**Accept:** Month-boundary rate tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D055 — Actual project-month engine
**Implement:** `rate_per_hour × 208` for a full month, divided by that month's **calendar days** for a daily cost; every day counts (C55, O01). Date- and assignment-based, never a forecast percentage.
**Accept:** Known cost fixture tests, including a partial month computed to the day and a short-month/long-month comparison. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D056 — Actual monthly aggregates
**Implement:** Persist only project-month actual totals and provenance — carrying **both figures** (C56, amending C05): the assignment-derived **calculated** cost and the **actual** entered by Cost Control from Accounts. That entry is what closes the project-month, stays editable afterwards, and every edit is audited.
**Accept:** No employee-month ledger tests, plus calculated-vs-actual and month-close tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D057 — Actual cost recalculation
**Implement:** Versioned recompute after a retroactive change. **No approval is required** and no change is silent: the before/after is recorded (C55, O18).
**Accept:** Diff and audit tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D058 — Assignment continuity
**Implement:** 100% recurring cost without monthly re-entry, continuing past a planned end until the assignment is explicitly extended or released (C53).
**Accept:** Multi-month continuity tests, including the past-end case still charging its project. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D059 — Leave records schema
**Implement:** Leave dates types employee and audit, with unpaid leave as its own type — the conversion target for C54.
**Accept:** Overlaps and status tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D060 — Paid leave cost handling
**Implement:** Keep first-month cost on the person's **project** — there are no shares to split by (C54, O08).
**Accept:** Leave cost tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D061 — Leave beyond month one
**Implement:** Convert leave running past **one continuous month** by creating a **new unpaid-leave entry** for the remainder, after a notification (C54, O08).
**Accept:** Unpaid-conversion tests, including that the original paid row is preserved. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D062 — Shift tracking
**Implement:** Effective-dated day/night assignment information, recorded by the Timekeeper (C54).
**Accept:** No unapproved premium tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D063 — Termination resignation
**Implement:** Close/flag assignments and capacity after event, at a **last-working-day `T − 1`** close (C54) — and record **secondment** as an event that allocates no cost while the person stays available. Recorded by the Timekeeper; HR keeps its own system.
**Accept:** No silent history loss tests, plus secondment-allocates-nothing tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D064 — Forecast reconciliation
**Implement:** Compare actual assignments against published forecast.
**Accept:** No auto-overwrite tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D065 — Reconciliation UI
**Implement:** Preview proposed changes and explicit revision workflow.
**Accept:** User confirmation tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D066 — Actual allocation report
**Implement:** Scoped employee deployment dates and status.
**Accept:** Actual not forecast tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D067 — Actual cost dashboard
**Implement:** Project month actual vs forecast and exceptions.
**Accept:** Numbers from DB tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D068 — Cost at completion engine
**Implement:** Actual past/current cutoff + future forecast.
**Accept:** Cutoff and all-forecast tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D069 — Project cost view
**Implement:** Cost-at-completion waterfall and month breakdown.
**Accept:** Terminology correct tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D070 — Project cost PDF
**Implement:** A3/A4 executive cost report with assumptions, in the **administrator and redacted variants** (C58) — after award the report stops at project-month totals, since position-level cost is a tender-phase artifact.
**Accept:** Valid totals and scope tests, plus a redaction test. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D071 — Consolidation project selection
**Implement:** Read-only multi-project filters that exclude the **retired tender row** once a project is awarded (C57) — the "awarded tender twin" this task already names.
**Accept:** No double counting tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D072 — Demand aggregation
**Implement:** Monthly designation department discipline FTE demand.
**Accept:** Duplicate rows count tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D073 — Supply aggregation
**Implement:** Available employees by qualification and actual capacity.
**Accept:** No double booking tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D074 — Gap/excess engine
**Implement:** Monthly demand minus eligible supply by skill.
**Accept:** Hiring/demobilization tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D075 — Tender demand, unweighted
**Implement:** Count tender demand at **100%** (C57, O11): no probability, no weighting, no scenario field — the option the spec left open was answered against the weighted view.
**Accept:** No hidden probability tests, plus a test that a tender project contributes its full demand. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D076 — Consolidated heatmap
**Implement:** Sticky month timeline drill-down and real data — this, with D072–D074, **is** the administrator's company-wide staff-allocation exercise across all awarded **and tender** projects, which carries **no cost** by design (C59).
**Accept:** Large matrix UX tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D077 — Consolidated charts
**Implement:** Supply-demand cost trends and real KPI tiles.
**Accept:** Data consistency tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D078 — Consolidated alerts
**Implement:** Hiring needs conflicts missing rates and end dates.
**Accept:** Prioritized actionable exceptions. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D079 — Consolidated export
**Implement:** A3 management report project selection and totals.
**Accept:** Cross-project scope tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D080 — Permission catalog
**Implement:** Domain actions and multiple role mappings, including the two confidentiality bindings C58 fixes (`rates.read` administrator-only; `costs.view` per role **and** project status) and the **Timekeeper** role C54 requires, holding `employee_events.manage`.
**Accept:** Least-privilege tests, including that no seeded non-admin role holds `rates.read`. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D081 — Project-scope policies
**Implement:** SQL-level project filtering across all domain APIs, with the **status gate beside the role gate** (C57): a tender project is invisible to everyone but the administrator, and a PM/PD sees only their own **awarded** projects.
**Accept:** Cross-project isolation tests, including tender invisibility and award-reveals-the-project. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D082 — Cost/rate confidentiality
**Implement:** Keep protected rate/cost fields out of the API response, the UI **and** the PDF — out of the *response*, not merely hidden in the client — and produce **both A3 variants** (C58, O16): the administrator's with rates and per-position cost, the redacted one with project-month totals.
**Accept:** Negative access tests, a redaction test on the report payload, and a test that no non-administrator response carries a rate field. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D083 — Audit coverage
**Implement:** Revision rate transfer leave assignment recalculation audit.
**Accept:** Before/after trace tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D083a — Assignment notices and exceptions
**Implement:** The notification and exception layer the 2026-10-10 decisions created: **configurable notices** (a transfer before the source's planned end, a transfer after it, an employee unassigned past a threshold, a rate change effective inside a forecasted period) delivered to the right roles; the **assignments-past-end exception list** with its **extend** and **release** actions (D041); and the **Unassigned queue** — employees with no assignment, whose cost sits on the internal cost centre until they are placed, alongside the rule that a person whose assignment ends without a successor keeps charging its **last project** while a notice is sent.
**Accept:** Tests that each notice is configurable rather than hard-coded, that the exception list shows exactly the assignments past a planned end, and that an unassigned employee appears in the queue with no project cost. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D084 — Domain API contract
**Implement:** OpenAPI typed frontend client drift check.
**Accept:** Schema consistency tests. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D085 — Domain backend tests
**Implement:** Real Postgres end-to-end costing and concurrency.
**Accept:** Integration gate green. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D086 — Domain frontend tests
**Implement:** Matrix keyboard paste revisions and error states.
**Accept:** Component gate green. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D087 — Domain browser E2E
**Implement:** Tender award transfer leave consolidation reports.
**Accept:** Browser gate green. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D088 — Performance and scale
**Implement:** Virtualized grids pagination and query indexes.
**Accept:** Documented benchmark fixture. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D089 — Final reports QA
**Implement:** A3/A4 PDF visual QA long tables pagination, covering **both A3 variants** (C58): the administrator's rate-and-position detail and the redacted project-month-total report.
**Accept:** Print-ready verified samples of each variant, plus a redaction check on the Cost Control/PM sample. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D090 — Release documentation
**Implement:** Business manual roles import/export ops guide.
**Accept:** Clean setup and user flows. **Handoff:** list changed files, focused checks, operator checks, and stop.

### D091 — Business release gate
**Implement:** Production-like deployment smoke and known limitations.
**Accept:** No unverified success claims. **Handoff:** list changed files, focused checks, operator checks, and stop.

## Gate checkpoints

After F016, F032, F048, F063, D018, D036, D063, D078, D091: **operator** runs broader checks; do not let Claude automatically advance across the gate. Record evidence in `docs/IMPLEMENTATION_LOG.md`.

## Repair-task protocol

If operator checks fail, send: `Fix only failure <command/error> arising from task <ID>. Do not implement the next task. Add a regression test, run focused checks and stop.`
