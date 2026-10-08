# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the **single cold-start handoff**; `claude_code_pack/STATE.md` is now just a pointer to it.
> Last updated: 2026-10-08 — after task F007.

**Rules for Claude Code:**
- **Commit at the end of each completed task** (C13). Push, deploy and final acceptance stay with the operator.
- **The operator runs all whole-suite and gate checks** (C14). Every handoff must give exact, copy-pasteable
  commands with expected outcomes. Never run or report a suite result you did not observe yourself.
- **Update this file at the end of each completed task.** Keep it short and true: keep "Completed work" to the
  last two tasks in detail and collapse older ones to one-liners — `git log` holds the rest.
- **Every completed task must add its runnable commands to §8** (start it, check it, test it), with the task ID
  that made them available. Remove or correct any command a later task invalidates. §8 is what the operator
  actually runs; it must never list a command that does not work yet.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md,
docs/ARCHITECTURE.md, docs/STACK_VERSIONS.md, NEXT_PROMPT.md and task F008 in
claude_code_pack/TASKS.md. Implement F008 only. Follow the one-task protocol.
Commit the task at the end. Update NEXT_PROMPT.md, then stop and give me the
operator checks — I run the suites myself.
```

Replace `F008` with the next ID from §3 when it changes. Read only the spec sections the task needs, and never
re-read all of `BIG-PROMPT.txt` — jump to a section using the index in `docs/REQUIREMENT_TRACEABILITY.md` §1–§11.

## 2. Where things are

| What | Path |
|---|---|
| Project root (repo) | `D:\resors` |
| Instruction pack | `claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md` (operator runbook incl. the test-command table), `STATE.md` (pointer only) |
| Task artifacts | `docs\` — `REPOSITORY_AUDIT.md` (F001), `REQUIREMENT_TRACEABILITY.md` (F002), `STACK_VERSIONS.md` (F003), `ARCHITECTURE.md` + `REFERENCE_PARITY.md` (F004) |
| Frontend (F006) | `frontend\` — `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src\{main.tsx,vite-env.d.ts,app\router.tsx}` |
| Backend (F007) | `backend\` — `pyproject.toml`, `uv.lock`, `.python-version`, `app\{main.py,core\config.py,api\v1\{router,health}.py}`; `models\`, `schemas\`, `services\`, `migrations\versions\`, `tests\` still empty |
| Reference material (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip`, `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |
| Unrelated — do not touch | `D:\QTC360\` (a separate QTC360 working area) |

Reference inputs are outside the repo by design and `.gitignore` carries a safety net. Read them by absolute
path; an out-of-folder read may raise a permission prompt, which is expected. Hashes:
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed: **F007 — backend bootstrap** (FastAPI + uv, health endpoint live).
- **Next task: F008 — PostgreSQL dev services.** Compose Postgres and an env example, no Redis; acceptance is a
  healthy DB and safe placeholders. Use `postgres:18.6-alpine` from `docs/STACK_VERSIONS.md`; the container is
  the first thing that will prove SQLAlchemy/asyncpg against PG 18 (deferred from F003).
- Git: branch `main`, one commit per completed task; the tree is clean after each commit. F007 sits on top of
  `bac5e04` (C14 policy).
- Last human verification: **NOT RUN** — no gate suite has been run by the operator yet.

## 4. Environment facts

- Windows 11; PowerShell-first, Bash (Git Bash/MSYS2) also available. Node **v24.14.0**, pnpm **12.9.1**
  (pinned in `package.json`, honoured — no corepack switch), `uv`, git 2.49, Python 3.14. Docker not yet verified.
- Both sides are installed: `frontend/node_modules` (28 packages, pnpm) and `backend/.venv` (`uv sync`, 64
  packages locked). Neither dev server is running by default.
- **No JWT anywhere** — C12 chose opaque session cookies, so `pyjwt`/`python-jose` are not dependencies.
- Mandated stack: React + Vite + TS strict SPA, Tailwind 4, FastAPI + async SQLAlchemy 2, PostgreSQL, uv,
  Alembic, Docker Compose, Caddy. **No Next.js, no Redis**, no public signup, one entity, AED only.
- Everything runs **same-origin**: relative `/api/v1`, Vite proxy in dev → `localhost:8000`, Caddy in prod.
- The reference archive is Next.js and is **untrusted**: never extract into the project tree, never execute it,
  never copy branding, `db_dump/*.csv` credentials, seed data, fonts or domain code.

## 5. Pending operator decisions

**None outstanding.** Everything raised so far is decided and recorded:

- **C11** pnpm · **C12** opaque rotating HttpOnly session cookies (no JWT/refresh) · **C13** agent commits each
  task · **C14** operator runs all suites, agent supplies the commands.
- **C12's fallout is reconciled** — F025/F029/F032 were amended in `TASKS.md` to match.
- **All seven F002 gaps are closed** (`docs/REQUIREMENT_TRACEABILITY.md` §14, now a resolution table):
  G-1 `input-group`→F011; G-2 the 21 enhanced generics distributed across F009/F011–F013/F016/F017/F019/F020/
  F050/F053/F054; G-3 redirects→F017; G-4 context-switcher slot→F015; G-5 `docs/TESTING.md`→F062;
  G-6 OpenAPI typed client→F018 generates / F061 drift-checks; G-7 S3 adapter→F049, malware hook→F060,
  delegation interface already in F004, signature asset excluded.
- **Also decided:** routing mode is **data-router**; the pack **stays in `claude_code_pack/`**; **Node stays
  24.14.0** with jsdom 29.1.1 (upgrading to 24.21.0 LTS is optional and only unlocks jsdom 30).
- `DECISIONS.md` OPEN items O01–O18 block only Stage B tasks — **no Stage A task is blocked**. Never silently
  turn an OPEN item into a rule.

## 6. Gaps and constraints later tasks must honour

- **TypeScript 6 deprecates `baseUrl`** — it errors and will stop working in TS 7. Omit `baseUrl`; `paths` alone
  resolves relative to the tsconfig file. Any new tsconfig must follow this.
- **`.gitattributes` must be extended, never replaced** — `* text=auto eol=lf` (scripts/Docker/Caddy LF;
  `*.ps1`/`*.bat`/`*.cmd` CRLF), overriding the machine-wide `core.autocrlf=true`.
- **Do not "helpfully" bump the pinned deviations:** TypeScript **6.0.3** (typescript-eslint peers `<6.1.0`) and
  jsdom **29.1.1** (30.x needs Node ≥24.15.0). Full rationale in `docs/STACK_VERSIONS.md` §5.
- **Tailwind is not installed yet** — F009 owns the theme tokens; do not add it early.
- `docs/ARCHITECTURE.md` §7 defines the extension boundaries (`AppModule`, `ScopePolicy`,
  `ContextSwitcherAdapter`); F063 proves them with a test-only module.
- Handoff convention: this file is the single source of truth; `STATE.md` is a state-free pointer (a practical
  rather than literal reading of `CLAUDE_MASTER.md` item 7).

## 7. Completed work (newest first)

- **F007 — backend bootstrap.** `backend/pyproject.toml` pins the exact `STACK_VERSIONS.md` versions on Python
  3.14 (`requires-python >=3.14`, `.python-version` = 3.14); `uv sync` locked **64 packages** and created
  `uv.lock` + `.venv`. `app/main.py` is an app factory with a lifespan hook, `app/core/config.py` is Pydantic
  Settings (neutral `APP_NAME`), and `app/api/v1/{router,health}.py` expose `/api/v1/health`. **No `/ready` yet**
  — there is nothing real to check, and a readiness endpoint that reports health it cannot verify would be a
  fake. It is assigned to **F023**, when PostgreSQL exists. Checks run: `uv sync` exit 0 (all pinned versions
  resolved); server started (`Application startup complete`) and `GET /api/v1/health` returned
  `{"status":"ok","name":"Application Platform","version":"0.1.0","environment":"development"}` with **HTTP
  200**; `GET /api/v1/nope` returned **404**. No JWT dependency — C12 makes one unnecessary
  (`STACK_VERSIONS.md` and `REFERENCE_PARITY.md` were corrected accordingly).
- **F006 — frontend bootstrap.** `frontend/package.json` pins the exact `STACK_VERSIONS.md` versions with
  `packageManager: pnpm@12.9.1` and `engines.node >=24`; scripts are `dev`/`build`/`preview`/`typecheck` only
  (ESLint belongs to F055 — no non-functional scripts were added). `vite.config.ts` wires the React plugin, the
  `@/*` alias and a `/api` dev proxy to `localhost:8000`. `tsconfig.json` is strict plus `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
  `src/app/router.tsx` establishes **data-router mode** with one honest placeholder route (no data), mounted
  from `src/main.tsx`. Checks run: `pnpm install` (28 packages, exact versions) → `pnpm run typecheck` exit 0 →
  `pnpm run build` exit 0 (91 modules, 312 kB JS, 227 ms) → dev server started and served `index.html` plus a
  correctly transformed `main.tsx` (React, react-dom/client, react-router and the `@/` alias all resolving).
- **F005 — repository structure** — 39 skeleton directories plus the root `.gitignore`, verified in both
  directions (13 paths that must be ignored are; both lock files stay tracked).
- **F004 — architecture decisions** — same-origin topology, opaque cookie sessions (C12), authorization model,
  foundation data model, Alembic strategy, extension interfaces; `REFERENCE_PARITY.md` classifies 70 reference
  areas (KEEP 11 / ADAPT 23 / REWRITE 15 / EXCLUDE 21).
- **F003 — stack verification** — 49 npm + 23 PyPI pins + 3 container tags queried live; `uv pip compile`
  resolved the backend set on Python 3.14 (169 packages).
- **F002 — requirement traceability** — 15 requirement groups, reverse index verified 1:1 (63/63).
- **F001 — repository audit** — verified the QTC360 archive and `BIG-PROMPT.txt`; moved both to
  `D:\RESORS_REFERENCE\`.

## 8. Commands — what you can run

Everything listed here works **today**. Each row names the task that made it available. Anything marked
*not yet* has no runner; it arrives with the task shown, and belongs to the owner of that task to add here.
The fuller table (including future suites) lives in `claude_code_pack/OPERATOR_GUIDE.md`.

### Start the apps

| What | Command | What you should see |
|---|---|---|
| **Frontend** (F006) | `cd D:\resors\frontend; pnpm run dev` | `VITE v8.3.4 ready` → open **http://localhost:5173** |
| **Backend API** (F007) | `cd D:\resors\backend; uv run uvicorn app.main:app --reload --port 8000` | `Application startup complete` → open **http://localhost:8000/docs** |
| **Frontend production build** (F006) | `cd D:\resors\frontend; pnpm run build; pnpm run preview` | serves the built app on **http://localhost:4173** |

Both dev servers can run at once. Stop either with `Ctrl+C`. If a port is busy, Vite/uvicorn will say so —
Vite auto-increments and prints the real URL.

### Check the work

| What | Command | Expected |
|---|---|---|
| Frontend types (F006) | `cd D:\resors\frontend; pnpm run typecheck` | exit 0, no output |
| Frontend build (F006) | `cd D:\resors\frontend; pnpm run build` | exit 0, writes `frontend/dist/` |
| API liveness (F007) | `curl http://localhost:8000/api/v1/health` | `{"status":"ok","name":"Application Platform",...}` |
| Dependencies current | `cd D:\resors\frontend; pnpm install` · `cd D:\resors\backend; uv sync` | pnpm: "Already up to date" · uv: "Audited 64 packages" |

### Repository

| What | Command | Expected |
|---|---|---|
| History | `git -C D:\resors log --oneline` | one commit per completed task |
| Working tree | `git -C D:\resors status --short` | empty |
| Line endings | `git -C D:\resors ls-files --eol` | every file `i/lf  w/lf` |
| Review a task | `git -C D:\resors show --stat <sha>` | that task's files only |

### Not available yet

| Suite | Arrives with |
|---|---|
| Postgres dev container, `docker compose up -d` | **F008 (next)** |
| Migrations (`alembic upgrade head`) | F023 |
| Backend unit tests (`uv run pytest`) | F026 (first tests) |
| Frontend lint / format | F055 |
| Frontend unit tests (`pnpm test -- --run`) | F011 (first tests), suite F055 |
| Backend lint / types (Ruff, mypy) | F056 |
| Postgres integration tests | F008 + F056 |
| End-to-end (Playwright) | F057 |
| Accessibility (axe) | F058 |
| Production Docker Compose | F059 |

Nothing in this table works yet — do not run it. Each row moves up into the sections above as its task lands.
