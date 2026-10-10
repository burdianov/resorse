# NEXT SESSION PROMPT — resors

> **Authoritative current-session handoff.** This file is the single cold-start handoff for `D:\resors`. It
> replaces the earlier 1,852-line version, which remains recoverable from Git with `git show ce8b703:NEXT_PROMPT.md`.
> Archived sections live in `docs/`. `claude_code_pack/STATE.md` stays a pointer to this file.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md, NEXT_PROMPT.md and task F051
in claude_code_pack/TASKS.md. Implement F051 only, following the one-task protocol: plan in at most
five bullets, implement, run focused checks, update NEXT_PROMPT.md, commit the task including the handoff, then stop and give
me the operator checks. Do not push. Do not start F052.
```

## 2. Current position

- **Stage A — domain-neutral foundation** (F001–F063). Stage B (D001–D091, construction domain) has not started.
- **Last completed:** F050 — Files API. Committed together with this handoff (`git log -1 --format="%h %s"`).
  The five endpoints over F049's private volume now exist: `backend/app/api/v1/files.py` (upload, metadata,
  download, delete, list), `backend/app/schemas/files.py` (`FileItem` carries no object key, by design), the
  committing endpoint half in `backend/app/services/storage.py` (`upload_file`, `load_file`, `list_files`,
  `delete_file`; F049's producer `delete_file` renamed `delete_file_row`), and the router wired in `router.py`.
  Recorded as C38; the `/files` paths are regenerated into `backend/openapi.json` and `frontend/src/lib/generated/`.
- **Previous task:** F049 — Private storage core. Commit **`1311d06`** (`feat(F049): ...`).
- **Next: F051 — PDF engine.** TASKS.md accept line: "Generated PDF parses."
- **Gates:** F016, F032, F047 and F048 are complete; operator gate results are **not recorded in this handoff**.
  **G-A3 (after F048) is due and is the operator's to run** (`OPERATOR_GUIDE.md` line 54); then **G-A4, after F063**.
- **Blockers:** none recorded.
- **Open decisions (DECISIONS.md):** **O01–O18 remain OPEN** — Stage B business rules (working-day calendar, rate
  changes within a month, percentage rules, revision semantics, and others). None is recorded as blocking F051;
  never treat one as approved or turn one into a confirmed rule, and if a task depends on one, stop and ask the
  operator one precise question. Confirmed: C11–C38 (C38 is F050's).
- **Open item — orphan objects (narrowed by F050):** `store_file`/`delete_file_row` never commit, and the object
  is unlinked only after the caller's commit succeeds. F050's `upload_file` now unlinks when the commit **raises**,
  so the aborted-upload case is closed; what remains is a process death between the row commit and the unlink.
  There is **no scheduler in this stack**, so no sweep was built — the residue is an unreferenced object, never a
  row pointing at nothing. Do not "fix" it by unlinking before commit.
- **Open item — nothing scans uploads yet:** BP-6.4's malware hook ships as the `MalwareScanner` Protocol with
  `NoMalwareScanner` (the name is the disclosure). No scanner is wired in; the API answers 400 if one ever refuses.
  Do not describe uploads as scanned.
- **Open item — two file components are deferred:** `FileDropzone` and `FilePreview` did not ship with F050
  (operator scope decision 2026-10-10: backend only). They belong to **F054**, the component lab and their first
  consumer; F053's report surface is the PDF pipeline's own preview, not this kit component (C38).
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
pinned), `backend/pyproject.toml` (Python `>=3.14`), `backend/uv.lock`, `frontend/pnpm-lock.yaml`.
`docs/ENVIRONMENT.md` is an archived snapshot and may be outdated.

Start the three services, each in its own terminal:

| Service | Command | Expected |
|---|---|---|
| Database | `cd D:\resors; docker compose up -d --wait` | `resors-postgres ... Healthy`, port 5432 |
| Frontend | `cd D:\resors\frontend; pnpm run dev` | `VITE ... ready` → http://localhost:5173 |
| Backend | `cd D:\resors\backend; uv run uvicorn app.main:app --reload --port 8000` | `Application startup complete` → http://localhost:8000/docs |

- The frontend calls relative `/api/v1`; Vite proxies it to port 8000 (same-origin, no CORS).
- `.env` sits at the repository root and is git-ignored.
- **Port clash:** other local projects also publish 5432. Change `POSTGRES_PORT` in `.env` to run them side by side.

## 5. Open item (unresolved, linked to F057)

**jsdom `Select` rendering.** In jsdom, an uncontrolled `Select` shows the raw value (`site`) on its trigger
instead of the label (`Site`), and leaves the listbox mounted. It may be a layout-less DOM artefact rather than
a defect, so tests neither assert nor forbid it. **Confirm in a real browser when Playwright arrives in F057,
then fix or dismiss it there.** Detail: `docs/CARRIED_CONSTRAINTS.md` §6.

## 6. Testing and quality gates

**Focused checks** (the agent runs these and reports observed results):
- Frontend: `cd D:\resors\frontend; pnpm exec vitest run <touched test files>` and `pnpm run typecheck`
- Backend: `cd D:\resors\backend; uv run pytest <touched test files>`
- If the API contract changed: `cd D:\resors\backend; uv run python -m scripts.export_openapi`, then
  `cd D:\resors\frontend; pnpm run api:types`. Both committed artefacts must be byte-stable apart from the task's own diff.

**Gate checks** (the operator runs these; the agent supplies the commands and never reports their results):
- `cd D:\resors\frontend; pnpm run typecheck` and `pnpm run build`
- `cd D:\resors\frontend; pnpm exec vitest run`
- `cd D:\resors\backend; uv run pytest`

**Ruff and mypy are not mandatory current operator checks.** The old handoff describes them as runnable;
`claude_code_pack/OPERATOR_GUIDE.md` (lines 38–39) associates them with F056. Their current availability is
unverified. Do not present them as operator checks until they are verified. CI enforcement is planned for F056.
Frontend lint and format and the coverage gate are planned for F055.

**Not yet available:** Playwright E2E (F057), axe accessibility (F058), production Compose (F059) — do not hand
these to the operator as runnable until their task lands.

**Test counts are historical.** Every count here was recorded at F050, and the agent's F050 runs were **focused
subsets, not the whole suite**. Report the count you actually observe; never present a historical one as verified.

## 7. Operator verification commands

Run these to confirm the state before F051 starts. The "F050 record" column is historical and is not a
current result. Report what you observe.

| Check | Command | F050 record (historical) |
|---|---|---|
| Working tree | `git -C D:\resors status --short` | clean after F050's commit |
| Last commit (HEAD) | `git -C D:\resors log -1 --format="%h %s"` | `feat(F050): ...` (implementation + handoff together). Previous: `1311d06 feat(F049): ...` |
| Backend health | `curl http://localhost:8000/api/v1/health` | `{"status":"ok",...}` |
| F050 focused batch | `cd D:\resors\backend; uv run pytest tests/test_files_api.py tests/test_storage.py tests/test_audit.py tests/test_admin_audit.py tests/test_database_conventions.py` | 138 passed, 1 skipped — the skip is the platform refusing unprivileged symlink creation; `tests/test_files_api.py` alone: 18 passed (observed by the agent at F050) |
| OpenAPI drift | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | F050 added the five `/files` paths to `backend/openapi.json` (+347 lines) and regenerated `frontend/src/lib/generated/api/{index,types.gen}.ts`; a re-run should be byte-stable (observed by the agent at F050) |
| Migration round trip | `upgrade head` → `downgrade base` → `upgrade head` against **`app_test`** only | **not run by the agent at F050** (F050 adds no migration). F049 record: clean, ending at `0009` (historical — never run this against `app_dev`) |
| Frontend typecheck | `cd D:\resors\frontend; pnpm run typecheck` | **not run by the agent at F050.** F048 record: exit 0, no diagnostics (historical) |
| Frontend suite | `cd D:\resors\frontend; pnpm exec vitest run` | **not run by the agent at F050.** F047 record: 498 passed (historical) |
| Backend suite | `cd D:\resors\backend; uv run pytest` | **not run by the agent at F050.** F047 record: 246 passed (historical) |

Two live checks worth running by hand, because they are the point of the task: upload at
`http://localhost:8000/docs` (`POST /api/v1/files`, multipart `file` + `category`), then `GET /api/v1/files/{id}/content`
must arrive as a download (`Content-Disposition: attachment`) with `nosniff` and `Cache-Control: private, no-store`;
and a **second** account asking for the first account's file id must get **404**, not 403.


The full command history, with per-task smoke recipes, is in `docs/VERIFICATION_LOG.md`. Use grep for a task ID.

## 8. Reference documents (read only the section a task needs)

| Document | Use |
|---|---|
| `claude_code_pack/CLAUDE_MASTER.md` | Protocol, stop conditions, operating lessons |
| `claude_code_pack/TASKS.md` | Backlog; F051 is at about line 207 |
| `claude_code_pack/DECISIONS.md` | Confirmed decisions C11–C38; open decisions O01–O18 |
| `claude_code_pack/PRODUCT_SPEC.md` | Functional contract; read only the needed sections |
| `claude_code_pack/OPERATOR_GUIDE.md` | Operator runbook and gate list |
| `docs/ARCHITECTURE.md` | §3 sessions, §5 frontend, §6 authorization, §7 extension boundaries, §12 implementation traps |
| `docs/REQUIREMENT_TRACEABILITY.md` | BP-x.y index (§1–§11) and §14 gaps |
| `docs/ROUTES_NAVIGATION.md`, `docs/OPENAPI_CLIENT.md` | Routing registry; typed-client recipe |
| `docs/STACK_VERSIONS.md` | Version pins and approved deviations (§5) |
| `docs/CARRIED_CONSTRAINTS.md` | Archived §6 constraints |
| `docs/ENVIRONMENT.md` | Archived §4 environment snapshot |
| `docs/COMPLETION_LOG.md` | Archived §7 completion history |
| `docs/VERIFICATION_LOG.md` | Archived §8 verification recipes |

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

The `NEXT:` line carries the ID and the title exactly as `TASKS.md` writes it, for example `NEXT: F051 — PDF engine`.

## 10. Accounts

Accounts are created by the operator. Credentials live only in the git-ignored `LOCAL_CREDENTIALS.md`, which the
agent never reads. Record a generated password when it is shown; most are shown once.

## 11. Maintaining this file

- Update this file at the end of every completed task: §1 task IDs, §2 position and open items, §6 counts, §7
  operator checks. Per-task history goes in `docs/COMPLETION_LOG.md`, recipes in `docs/VERIFICATION_LOG.md`;
  git history is the record of commits.
- Keep this file under 200 lines. Move detail to a `docs/` file instead of growing it.
