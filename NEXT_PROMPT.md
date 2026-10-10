# NEXT SESSION PROMPT — resors

> **Authoritative current-session handoff.** This file is the single cold-start handoff for `D:\resors`. It
> replaces the earlier 1,852-line version, which remains recoverable from Git with `git show ce8b703:NEXT_PROMPT.md`.
> Archived sections live in `docs/`. `claude_code_pack/STATE.md` stays a pointer to this file.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md, NEXT_PROMPT.md and task F055
in claude_code_pack/TASKS.md. Implement F055 only, following the one-task protocol: plan in at most
five bullets, implement, run focused checks, update NEXT_PROMPT.md, commit the task including the handoff, then stop and give
me the operator checks. Do not push. Do not start F056.
```

## 2. Current position

- **Stage A — domain-neutral foundation** (F001–F063). Stage B (D001–D091, construction domain) has not started.
- **Last completed:** F054 — Frontend component lab. Committed with this handoff (`git log -1 --format="%h %s"`).
  `/tools/components` is registered from an `import.meta.env.DEV` literal, so a production bundle has no such route
  and the path 404s; the `dev.tools` flag and `adminOnly` gate only the *link*, and `RouteGuard` reads neither — a
  dev build's lab is reachable by address, which is how a developer opens it. It holds the primitives, the recharts
  wrappers (`components/charts/`) and the first real use of the `FileDropzone`/`FilePreview` F050 deferred (C38).
  Recorded as C42, whose lesson came from a build: a `lazy(...)` hoisted above the DEV ternary survives DCE and
  ships the page as an unreachable **449 kB** chunk — verify the exclusion **by building and searching `dist/`**.
- **Previous task:** F053 — User directory report. Commit **`cbad877`** — the stack's first report routes
  (`POST /reports/user-directory`, `GET /reports/engine-health`) and the export UI (C41). F052 (`15e8cc9`) before it.
- **Next: F055 — Frontend quality gate.** TASKS.md: "Lint format typecheck Vitest coverage"; accept line
  "Recorded actual results." It is what adds the frontend lint/format and coverage gates §6 names as planned.
- **Gates:** F016, F032, F047 and F048 are complete; operator gate results are **not recorded in this handoff**.
  **G-A3 (after F048) is due and is the operator's to run** (`OPERATOR_GUIDE.md` line 54); then **G-A4, after F063**.
- **Blockers:** none recorded.
- **Open decisions (DECISIONS.md):** **O01–O18 remain OPEN** — Stage B business rules (working-day calendar, rate
  changes within a month, percentage rules, revision semantics, and others). None is recorded as blocking F055;
  never treat one as approved or turn one into a confirmed rule, and if a task depends on one, stop and ask the
  operator one precise question. Confirmed: C11–C42 (C42 is F054's).
- **Open item — the `/ready` endpoint is not built (BP-8.4b):** `conversion.health()` is the probe that belongs
  behind it, but no readiness route exists; F053's `reports/engine-health` reports the *report* engine instead, which
  is a different question. Whichever task builds `/ready` should read `health()`, not re-implement the call.
- **Open item — orphan objects:** the object is unlinked only *after* the caller's commit (and when it raises), so
  the residue is a process death in between — an unreferenced object, never a dangling row. No scheduler exists, so
  no sweep is built; never unlink before commit.
- **Open item — nothing scans uploads yet:** BP-6.4's hook ships as `MalwareScanner` + `NoMalwareScanner` (the
  name is the disclosure). Nothing is wired in; the API answers 400 if one ever refuses — never call uploads scanned.
- **Open item:** jsdom `Select` rendering, linked to **F057** — see §5.

## 3. Essential constraints

Full text is in `docs/CARRIED_CONSTRAINTS.md`. The rules below apply to every task.

- **Commit** each completed task (C13). **Never push**, deploy, or make irreversible data changes.
- **The operator runs all whole-suite and gate checks** (C14). Give exact commands with expected outcomes.
  Never report a suite you did not run yourself.
- **Authorization is server-side.** New endpoints use `current_session` (never `authenticated_session` unless
  the route is on the auth router's exemption list). Privileged data uses `require_permission(PermissionCode.X)`.
- **Forced-password-change gate:** `current_session` returns **403** ("Your password must be changed before
  continuing.") while `must_change_password` is set. Only the auth exemption list is reachable during that state.
- **Toast policy:** a cold query failure renders inline (`ErrorState`). A background query failure and a failed
  mutation use toast notifications. Do not unify the two (`docs/OPENAPI_CLIENT.md` §4).
- **API changes:** regenerate `backend/openapi.json` and `frontend/src/lib/generated/`. Never hand-edit generated
  files. Call the API only through `frontend/src/lib/api.ts`.
- **Query keys** for user-scoped data include the user id. Do not add a second poller for the unread count.
- **Schema changes** need a migration. Never edit an applied migration. Never run `alembic downgrade base`
  against `app_dev`; scratch tests use `app_test`.
- **Money and rates:** PostgreSQL NUMERIC / Python `Decimal`, never floats. Dates: UAE display; UTC instants for events.
- **Pages:** one `RouteDefinition` in `frontend/src/config/navigation.ts`. Never register a page that does not exist.
- **Audit:** every new service mutation calls `audit.record` inside its transaction. Inbox operations are excluded (C34).
- **Scope:** Stage A adds no construction domain code. One legal entity, AED only.
- **Approved version deviations — do not upgrade:** TypeScript **6.0.3** and jsdom **29.1.1**. Rationale is in
  `docs/STACK_VERSIONS.md` §5 and `docs/CARRIED_CONSTRAINTS.md` §6.
- **Not allowed:** Redis, Next.js, public signup, seeded production passwords, inert buttons, fake data.
- **Windows scripted writes** can insert control bytes into files. After one, run the check in
  `docs/CARRIED_CONSTRAINTS.md` §6.
- **Credentials:** never read or print `LOCAL_CREDENTIALS.md`, `.env` values, or any password.

## 4. Environment

Verify versions against the configuration files, not this list: `frontend/package.json` (Node `>=24`, pnpm 12.9.1
pinned), `backend/pyproject.toml` (Python `>=3.14`), `backend/uv.lock`, `frontend/pnpm-lock.yaml`;
`docs/ENVIRONMENT.md` is an archived snapshot and may be outdated.

Start the services, each in its own terminal:

| Service | Command | Expected |
|---|---|---|
| Database | `cd D:\resors; docker compose up -d --wait` | `resors-postgres ... Healthy`, port 5432 |
| Converter | same command (F052 added it to that file) | `resors-gotenberg ... Healthy`, port `${GOTENBERG_PORT:-3100}` → 3000. Only reports need it; the API starts and runs without it |
| Frontend | `cd D:\resors\frontend; pnpm run dev` | `VITE ... ready` → http://localhost:5173 |
| Backend | `cd D:\resors\backend; uv run uvicorn app.main:app --reload --port 8000` | `Application startup complete` → http://localhost:8000/docs |

- The frontend calls relative `/api/v1`; Vite proxies it to port 8000 (same-origin, no CORS).
- `.env` sits at the repository root and is git-ignored.
- **Port clash:** other local projects also publish 5432 (and possibly 3100). Change `POSTGRES_PORT` /
  `GOTENBERG_PORT` in `.env` to run them side by side — and change `GOTENBERG_URL` with the converter's port.

## 5. Open item (unresolved, linked to F057)

**jsdom `Select` rendering.** In jsdom, an uncontrolled `Select` shows the raw value (`site`) on its trigger instead
of the label (`Site`), and leaves the listbox mounted. It may be a layout-less DOM artefact rather than a defect, so
tests neither assert nor forbid it. **Confirm in a real browser when Playwright arrives in F057** (`docs/CARRIED_CONSTRAINTS.md` §6).

## 6. Testing and quality gates

**Focused checks** (the agent runs these and reports observed results):
- Frontend: `cd D:\resors\frontend; pnpm exec vitest run <touched test files>` and `pnpm run typecheck`
- Backend: `cd D:\resors\backend; uv run pytest <touched test files>`; `uv run ruff format --check <files>`,
  `uv run ruff check <files>`, `uv run mypy <files>`
- If the API contract changed: `cd D:\resors\backend; uv run python -m scripts.export_openapi`, then
  `cd D:\resors\frontend; pnpm run api:types`. Both committed artefacts must be byte-stable apart from the task's own diff.
- If the change touches a **dev-only surface** (F054's rule): `cd D:\resors\frontend; pnpm run build`, then search
  `dist/` for a lab-only string ("Development builds only", `recharts`) and for the route path — any match means
  the exclusion failed. Do not infer the exclusion from the `import.meta.env.DEV` ternary.

**Gate checks** (the operator runs these; the agent supplies the commands and never reports their results):
- `cd D:\resors\frontend; pnpm run typecheck` and `pnpm run build`
- `cd D:\resors\frontend; pnpm exec vitest run`
- `cd D:\resors\backend; uv run pytest`

**Ruff and mypy are runnable** — `cd D:\resors\backend; uv run ruff format --check <files>` / `uv run ruff check
<files>` / `uv run mypy <files>` — and F053 ran all three on its touched files as focused checks. They are still
**not operator gate checks**: `OPERATOR_GUIDE.md` (lines 38–39) associates them with F056. Frontend lint/format and
coverage remain F055's to add.

**Not yet available:** Playwright E2E (F057), axe accessibility (F058), production Compose (F059) — do not hand these
to the operator as runnable until their task lands. **Test counts are historical**: report the count you observe.

## 7. Operator verification commands

Run these before F055 starts. The "F054 record" column is historical, not a current result.

| Check | Command | F054 record (historical) |
|---|---|---|
| Working tree | `git -C D:\resors status --short` | clean after F054's commit |
| Last commit (HEAD) | `git -C D:\resors log -1 --format="%h %s"` | `feat(F054): frontend component lab` (implementation + handoff together). Previous: `cbad877 feat(F053): ...` |
| Backend health | `curl http://localhost:8000/api/v1/health` | `{"status":"ok",...}` |
| Report engine (opt-in) | `curl http://localhost:8000/api/v1/reports/engine-health` with an admin session, and for the DOCX half `curl http://localhost:3100/health` then `$env:RESORS_LIVE_GOTENBERG=1; cd D:\resors\backend; uv run pytest tests/test_report_conversion.py -q -k live` | **not run by the agent at F053** — the first needs a signed-in session and the second a running Gotenberg (`docker compose up -d`); that one is still the only test that proves LibreOffice actually ran |
| F053 focused batch (backend) | `cd D:\resors\backend; uv run pytest tests/test_reports_api.py tests/test_reports.py tests/test_report_conversion.py tests/test_admin_users.py -q` | 76 passed, 1 skipped (observed at F053; the skip is the opt-in live conversion) |
| OpenAPI drift | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | F054 changes no API. F053 added two routes, both committed, so a re-run should be byte-stable (observed at F053) |
| Migration round trip | `upgrade head` → `downgrade base` → `upgrade head` against **`app_test`** only | **not run by the agent** (F054 adds no migration). F049 record: clean, ending at `0009` (historical — never run this against `app_dev`) |
| Frontend typecheck | `cd D:\resors\frontend; pnpm run typecheck` | exit 0, no diagnostics (observed at F054; `pnpm run build` runs that same `tsc --noEmit` first) |
| **Dev-only exclusion** | `cd D:\resors\frontend; pnpm run build`, then search `dist/` for `Development builds only` / `recharts` / `tools/components` | **no match** (observed at F054): the lab page and recharts are absent from `dist/` and no `components-*.js` chunk is emitted. A match means the exclusion broke |
| F054 focused batch (frontend) | `cd D:\resors\frontend; pnpm exec vitest run tests/config/features.test.ts tests/components/charts.test.tsx tests/components/file-dropzone.test.tsx tests/components/file-preview.test.tsx tests/tools/components.test.tsx` | 25 passed (5 files, 5 tests each): the feature-flag module, the chart wrappers, the two file components, the lab page. After the registry change, the navigation-dependent suites re-run together with the lab: 38 passed (4 files, observed) |
| Frontend suite | `cd D:\resors\frontend; pnpm exec vitest run` | **a gate check: the operator owns the result.** The agent ran it once at F053 while checking its own diff: 62 files, 539 passed. F047 record: 498 passed (historical) |
| Backend suite | `cd D:\resors\backend; uv run pytest` | **a gate check; not run by the agent at F054.** F047 record: 246 passed (historical) |

**The F054 end-to-end check.** In a **dev** build (`pnpm run dev`), signed in as an `admin`, the sidebar should show
a **Tools** group holding **Component Lab**; `/tools/components` should render the primitives, the charts and the
files section, and that section should upload a real file, preview the text one, download it under the server's own
name, and delete it through the confirm dialog. In a **production** build the same path must 404 — the build row
above checks that without a browser. F053's export check (`/admin/users` → **Export PDF** →
`user-directory-<date>.pdf`, and the 1,000-row limit sentence) and F050's download checks (an `attachment`
disposition with `nosniff` and `private, no-store`; a second account getting **404** for a foreign file id) remain
worth running by hand at `http://localhost:8000/docs`. Command history: `docs/VERIFICATION_LOG.md` — grep a task ID.

## 8. Reference documents (read only the section a task needs)

| Document | Use |
|---|---|
| `claude_code_pack/CLAUDE_MASTER.md` | Protocol, stop conditions, operating lessons |
| `claude_code_pack/TASKS.md` | Backlog; F055 is at about line 223 |
| `claude_code_pack/DECISIONS.md` | Confirmed decisions C11–C42; open decisions O01–O18 |
| `claude_code_pack/PRODUCT_SPEC.md` | Functional contract; read only the needed sections |
| `claude_code_pack/OPERATOR_GUIDE.md` | Operator runbook and gate list |
| `docs/ARCHITECTURE.md` | §3 sessions, §5 frontend, §6 authorization, §7 extension boundaries, §12 implementation traps |
| `docs/REQUIREMENT_TRACEABILITY.md` | BP-x.y index (§1–§11) and §14 gaps |
| `docs/ROUTES_NAVIGATION.md`, `docs/OPENAPI_CLIENT.md` | Routing registry; typed-client recipe |
| `docs/STACK_VERSIONS.md` | Version pins and approved deviations (§5) |
| `docs/CARRIED_CONSTRAINTS.md` | Archived §6 constraints |
| `docs/ENVIRONMENT.md` | Archived §4 environment snapshot |

**Do not load the four archives in full.** They are large. Search them for the task ID you need.
Do not re-read `BIG-PROMPT.txt` whole; use the index in `docs/REQUIREMENT_TRACEABILITY.md`.

## 9. Handoff format

End every task with this block, then stop and wait for the operator:

```text
TASK: <ID> — <name>
STATUS: DONE | PARTIAL | BLOCKED
FILES: <paths>
CHECKS RUN: <commands and observed results, or NOT RUN>
OPERATOR CHECKS: <exact commands and expected outcomes>
DECISIONS/BLOCKERS: <only material items>
NEXT: <ID> — <task name>
```

The `NEXT:` line carries the ID and the title exactly as `TASKS.md` writes it, for example `NEXT: F054 — Frontend component lab`.

## 10. Accounts

Accounts are created by the operator. Credentials live only in the git-ignored `LOCAL_CREDENTIALS.md`, which the agent never reads; record a generated password when it is shown, since most are shown once.

## 11. Maintaining this file

- Update this file at the end of every completed task: §1 task IDs, §2 position and open items, §6 counts, §7 operator
  checks. Per-task history → `docs/COMPLETION_LOG.md`, recipes → `docs/VERIFICATION_LOG.md`, commits → git. **Keep it under 200 lines**; to grow it, move detail into `docs/`.
