# NEXT SESSION PROMPT — resors

> **Authoritative current-session handoff.** This file is the single cold-start handoff for `D:\resors`. It
> replaces the earlier 1,852-line version, which remains recoverable from Git with `git show ce8b703:NEXT_PROMPT.md`.
> Archived sections live in `docs/`. `claude_code_pack/STATE.md` stays a pointer to this file.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md, NEXT_PROMPT.md and task F052
in claude_code_pack/TASKS.md. Implement F052 only, following the one-task protocol: plan in at most
five bullets, implement, run focused checks, update NEXT_PROMPT.md, commit the task including the handoff, then stop and give
me the operator checks. Do not push. Do not start F053.
```

## 2. Current position

- **Stage A — domain-neutral foundation** (F001–F063). Stage B (D001–D091, construction domain) has not started.
- **Last completed:** F051 — PDF engine. Committed together with this handoff (`git log -1 --format="%h %s"`).
  `backend/app/services/reports.py` renders (`render_report`) and merges (`merge_pdfs`) PDFs and adds **no route**:
  the endpoint, the `reports.generate` guard, the worker-thread hand-off and the preview UI are F053's, and the DOCX
  half of BP-7.9b is F052's. The footer's page total is **measured, not guessed**; a spilling table repeats its
  header; a non-rectangular row is refused by name; every value is escaped before it reaches a `Paragraph`. Fonts
  are ReportLab's built-ins only, so the text stays extractable — which is what the acceptance, "the generated PDF
  parses", is checked with — at the cost of Latin-1 only (Arabic/CJK await an embedded TTF). Recorded as C39.
- **Previous task:** F050 — Files API. Commit **`b6aca64`** (`feat(F050): ...`) — the five endpoints over F049's
  private volume, with `/files` regenerated into `backend/openapi.json` and `frontend/src/lib/generated/`.
- **Next: F052 — DOCX conversion.** TASKS.md accept line: "Healthy/unavailable tests."
- **Gates:** F016, F032, F047 and F048 are complete; operator gate results are **not recorded in this handoff**.
  **G-A3 (after F048) is due and is the operator's to run** (`OPERATOR_GUIDE.md` line 54); then **G-A4, after F063**.
- **Blockers:** none recorded.
- **Open decisions (DECISIONS.md):** **O01–O18 remain OPEN** — Stage B business rules (working-day calendar, rate
  changes within a month, percentage rules, revision semantics, and others). None is recorded as blocking F052;
  never treat one as approved or turn one into a confirmed rule, and if a task depends on one, stop and ask the
  operator one precise question. Confirmed: C11–C39 (C39 is F051's).
- **Open item — orphan objects (narrowed by F050):** the object is unlinked only after the caller's commit
  succeeds (F050's `upload_file` also unlinks when that commit **raises**), so what remains is a process death
  between commit and unlink. There is **no scheduler in this stack**, so no sweep exists: the residue is an
  unreferenced object, never a dangling row — and never "fix" it by unlinking before commit.
- **Open item — nothing scans uploads yet:** BP-6.4's hook ships as `MalwareScanner` + `NoMalwareScanner` (the
  name is the disclosure). Nothing is wired in; the API answers 400 if one ever refuses — never call uploads scanned.
- **Open item — two file components are deferred:** `FileDropzone`/`FilePreview` did not ship with F050 (operator
  scope decision: backend only); they belong to **F054**, the component lab and their first consumer (C38).
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

**Test counts are historical.** Every count here was recorded at F051, and the agent's runs were **focused
subsets, not the whole suite**. Report the count you actually observe; never present a historical one as verified.

## 7. Operator verification commands

Run these to confirm the state before F052 starts. The "F051 record" column is historical and is not a
current result. Report what you observe.

| Check | Command | F051 record (historical) |
|---|---|---|
| Working tree | `git -C D:\resors status --short` | clean after F051's commit |
| Last commit (HEAD) | `git -C D:\resors log -1 --format="%h %s"` | `feat(F051): ...` (implementation + handoff together). Previous: `b6aca64 feat(F050): ...` |
| Backend health | `curl http://localhost:8000/api/v1/health` | `{"status":"ok",...}` |
| F051 focused batch | `cd D:\resors\backend; uv run pytest tests/test_reports.py` | 22 passed (observed by the agent at F051). The adjacent F050 batch (files, storage, audit, conventions) recorded 138 passed, 1 skipped — historical |
| OpenAPI drift | `cd D:\resors\backend; uv run python -m scripts.export_openapi` then `cd D:\resors\frontend; pnpm run api:types` | F051 adds **no route**, so `backend/openapi.json` and `frontend/src/lib/generated/` are unchanged by it and a re-run should be byte-stable (observed by the agent at F051 — no regeneration was needed) |
| Migration round trip | `upgrade head` → `downgrade base` → `upgrade head` against **`app_test`** only | **not run by the agent at F051** (F051 adds no migration). F049 record: clean, ending at `0009` (historical — never run this against `app_dev`) |
| Frontend typecheck | `cd D:\resors\frontend; pnpm run typecheck` | **not run by the agent at F051.** F048 record: exit 0, no diagnostics (historical) |
| Frontend suite | `cd D:\resors\frontend; pnpm exec vitest run` | **not run by the agent at F051.** F047 record: 498 passed (historical) |
| Backend suite | `cd D:\resors\backend; uv run pytest` | **not run by the agent at F051.** F047 record: 246 passed (historical) |

F051 adds **no route**, so it has no live check: the engine is exercised only by its tests, and the end-to-end
PDF check arrives with **F053**'s report endpoint. F050's download checks — a `Content-Disposition: attachment`
with `nosniff` and `private, no-store`, and a second account getting **404** for a foreign file id — remain
worth running by hand at `http://localhost:8000/docs`.

The full command history, with per-task smoke recipes, is in `docs/VERIFICATION_LOG.md`. Use grep for a task ID.

## 8. Reference documents (read only the section a task needs)

| Document | Use |
|---|---|
| `claude_code_pack/CLAUDE_MASTER.md` | Protocol, stop conditions, operating lessons |
| `claude_code_pack/TASKS.md` | Backlog; F052 is at about line 211 |
| `claude_code_pack/DECISIONS.md` | Confirmed decisions C11–C39; open decisions O01–O18 |
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

The `NEXT:` line carries the ID and the title exactly as `TASKS.md` writes it, for example `NEXT: F052 — DOCX conversion`.

## 10. Accounts

Accounts are created by the operator. Credentials live only in the git-ignored `LOCAL_CREDENTIALS.md`, which the
agent never reads. Record a generated password when it is shown; most are shown once.

## 11. Maintaining this file

- Update this file at the end of every completed task: §1 task IDs, §2 position and open items, §6 counts, §7
  operator checks. Per-task history goes in `docs/COMPLETION_LOG.md`, recipes in `docs/VERIFICATION_LOG.md`;
  git history is the record of commits.
- Keep this file under 200 lines. Move detail to a `docs/` file instead of growing it.
