# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the **single cold-start handoff**; `claude_code_pack/STATE.md` is now just a pointer to it.
> Last updated: 2026-10-08 — after task F006.

**Rules for Claude Code:**
- **Commit at the end of each completed task** (C13). Push, deploy and final acceptance stay with the operator.
- **The operator runs all whole-suite and gate checks** (C14). Every handoff must give exact, copy-pasteable
  commands with expected outcomes. Never run or report a suite result you did not observe yourself.
- **Update this file at the end of each completed task.** Keep it short and true: keep "Completed work" to the
  last two tasks in detail and collapse older ones to one-liners — `git log` holds the rest.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md,
docs/ARCHITECTURE.md, docs/STACK_VERSIONS.md, NEXT_PROMPT.md and task F007 in
claude_code_pack/TASKS.md. Implement F007 only. Follow the one-task protocol.
Commit the task at the end. Update NEXT_PROMPT.md, then stop and give me the
operator checks — I run the suites myself.
```

Replace `F007` with the next ID from §3 when it changes. Read only the spec sections the task needs, and never
re-read all of `BIG-PROMPT.txt` — jump to a section using the index in `docs/REQUIREMENT_TRACEABILITY.md` §1–§11.

## 2. Where things are

| What | Path |
|---|---|
| Project root (repo) | `D:\resors` |
| Instruction pack | `claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md` (operator runbook incl. the test-command table), `STATE.md` (pointer only) |
| Task artifacts | `docs\` — `REPOSITORY_AUDIT.md` (F001), `REQUIREMENT_TRACEABILITY.md` (F002), `STACK_VERSIONS.md` (F003), `ARCHITECTURE.md` + `REFERENCE_PARITY.md` (F004) |
| Frontend (F006) | `frontend\` — `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src\{main.tsx,vite-env.d.ts,app\router.tsx}` + the empty skeleton dirs |
| Backend (empty until F007) | `backend\` — `app\{api/v1,core,models,schemas,services}`, `migrations/versions`, `tests\*` |
| Reference material (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip`, `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |
| Unrelated — do not touch | `D:\QTC360\` (a separate QTC360 working area) |

Reference inputs are outside the repo by design and `.gitignore` carries a safety net. Read them by absolute
path; an out-of-folder read may raise a permission prompt, which is expected. Hashes:
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed: **F006 — frontend bootstrap** (Vite + React 19.3 + TS 6.0.3 strict + Router 8.4 in data-router mode).
- **Next task: F007 — backend bootstrap.** FastAPI + uv config + a health endpoint; acceptance is that the API
  starts and health responds. Pin the exact versions from `docs/STACK_VERSIONS.md` (Python 3.14, FastAPI 0.143.0,
  SQLAlchemy 2.1.4, alembic 1.20.0, uvicorn 0.54.0 …) and generate `uv.lock`. The backend skeleton dirs exist but
  are empty.
- Git: branch `main`, one commit per completed task; the tree is clean after each commit. F006 sits on top of
  `4221f38` (backlog reconciliation).
- Last human verification: **NOT RUN** — no gate suite has been run by the operator yet.

## 4. Environment facts

- Windows 11; PowerShell-first, Bash (Git Bash/MSYS2) also available. Node **v24.14.0**, pnpm **12.9.1**
  (pinned in `package.json`, honoured — no corepack switch), `uv`, git 2.49, Python 3.14. Docker not yet verified.
- Frontend dependencies **are installed** (`frontend/node_modules`, 28 packages); backend has none yet.
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

- **F006 — frontend bootstrap.** `frontend/package.json` pins the exact `STACK_VERSIONS.md` versions with
  `packageManager: pnpm@12.9.1` and `engines.node >=24`; scripts are `dev`/`build`/`preview`/`typecheck` only
  (ESLint belongs to F055 — no non-functional scripts were added). `vite.config.ts` wires the React plugin, the
  `@/*` alias and a `/api` dev proxy to `localhost:8000`. `tsconfig.json` is strict plus `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
  `src/app/router.tsx` establishes **data-router mode** with one honest placeholder route (no data), mounted
  from `src/main.tsx`. Checks run: `pnpm install` (28 packages, exact versions) → `pnpm run typecheck` exit 0 →
  `pnpm run build` exit 0 (91 modules, 312 kB JS, 227 ms) → dev server started and served `index.html` plus a
  correctly transformed `main.tsx` (React, react-dom/client, react-router and the `@/` alias all resolving).
- **F005 — repository structure.** 39 skeleton directories (frontend 24, backend 15) per `ARCHITECTURE.md`
  §4/§5, no placeholder files (§8.1 forbids unused files), plus the root `.gitignore`. Ignore rules verified in
  both directions: 13 paths that must be ignored are, 8 that must stay tracked are (both lock files included).
- **F004 — architecture decisions** — same-origin topology, opaque cookie sessions (C12), authorization model,
  foundation data model, Alembic strategy, extension interfaces; `REFERENCE_PARITY.md` classifies 70 reference
  areas (KEEP 11 / ADAPT 23 / REWRITE 15 / EXCLUDE 21).
- **F003 — stack verification** — 49 npm + 23 PyPI pins + 3 container tags queried live; `uv pip compile`
  resolved the backend set on Python 3.14 (169 packages).
- **F002 — requirement traceability** — 15 requirement groups, reverse index verified 1:1 (63/63).
- **F001 — repository audit** — verified the QTC360 archive and `BIG-PROMPT.txt`; moved both to
  `D:\RESORS_REFERENCE\`.

## 8. Verification commands

```powershell
Get-Content D:\resors\NEXT_PROMPT.md -TotalCount 20
git -C D:\resors log --oneline          # one commit per completed task
git -C D:\resors status --short         # clean
```

```bash
cd /d/resors/frontend
pnpm run typecheck                      # expect exit 0, no output
pnpm run build                          # expect dist/ written, exit 0
pnpm run dev                            # expect http://localhost:5173 to serve the app
```

Broader suites (backend, lint, unit, E2E) do not exist yet — the live/not-available table is in
`claude_code_pack/OPERATOR_GUIDE.md`, and each handoff names the exact subset to run.
