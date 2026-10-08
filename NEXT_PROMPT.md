# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the **single cold-start handoff**; `claude_code_pack/STATE.md` is now just a pointer to it.
> Last updated: 2026-10-08 — after task F005.

**Rule for Claude Code: update this file at the END of each completed task, then commit the task's changes**
(C13 — the agent commits each completed task; push/deploy stay with the operator). Keep this file short, true
and current: keep "Completed work" to the last two tasks in detail and collapse older ones to one-liners —
`git log` holds the rest. Never record a check as passed unless you ran it. If a task is abandoned or blocked,
say so here rather than leaving the previous state looking current.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md,
docs/ARCHITECTURE.md, docs/STACK_VERSIONS.md, NEXT_PROMPT.md and task F006 in
claude_code_pack/TASKS.md. Implement F006 only. Follow the one-task protocol.
Commit the task at the end. Update NEXT_PROMPT.md, then stop and give me the
operator checks.
```

Replace `F006` with the next ID from §3 when it changes. Follow the pack's economy rules: read only the spec
sections the task needs, and never re-read all of `BIG-PROMPT.txt` — jump to a section using the index in
`docs/REQUIREMENT_TRACEABILITY.md` §1–§11.

## 2. Where things are

| What | Path |
|---|---|
| Project root (repo) | `D:\resors` |
| Instruction pack | `claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md`, `STATE.md` (pointer only) |
| Task artifacts | `docs\` — `REPOSITORY_AUDIT.md` (F001), `REQUIREMENT_TRACEABILITY.md` (F002), `STACK_VERSIONS.md` (F003), `ARCHITECTURE.md` + `REFERENCE_PARITY.md` (F004) |
| Skeleton (empty until F006/F007 fill it) | `frontend\` (public, src/{app,components/*,config,features,hooks,lib,pages,styles,testing}, tests/*), `backend\` (app/{api/v1,core,models,schemas,services}, migrations/versions, tests/*) |
| Reference material (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip`, `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |
| Unrelated — do not touch | `D:\QTC360\` (a separate QTC360 working area) |

Reference inputs are deliberately outside the repo so they can never be committed, and `.gitignore` carries a
safety net (`qtc360*.zip`, `BIG-PROMPT.txt`) in case a copy is dropped back in. Read them by absolute path; an
out-of-folder read may raise a permission prompt, which is expected. Expected hashes:
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed: **F005 — repository structure** (skeleton + `.gitignore`).
- **Next task: F006 — frontend bootstrap.** Vite + React + TS strict + Router and basic scripts; acceptance is
  that Vite starts and TypeScript passes. Pin the exact versions from `docs/STACK_VERSIONS.md` and generate
  `pnpm-lock.yaml`; `package.json` should carry a `packageManager` field.
- Git: branch `main`. F005 sits on top of `7bdec87`; the working tree is clean after each task's commit.
  History: `7486b05` F004 docs, `7bdec87` commit policy, `38e7b75` handoff merge, `58f5efd` F003, `f386964`
  F002, `51aca2e` pack.
- Last human verification: **NOT RUN** — the operator has never run any task's checks or reviewed a diff.

## 4. Environment facts

- Windows 11; PowerShell-first, Bash (Git Bash/MSYS2) also available. Node **v24.14.0** (LTS line is 24.21.0),
  pnpm **12.9.1** (latest 12.10.1), `uv`, git 2.49, Python 3.14 available. Docker not yet verified.
- **Stack is pinned but nothing is installed.** `docs/STACK_VERSIONS.md` is the single source of truth.
- Mandated stack: React + Vite + TS strict SPA, Tailwind 4, FastAPI + async SQLAlchemy 2, PostgreSQL, uv,
  Alembic, Docker Compose, Caddy. **No Next.js, no Redis**, no public signup, one entity, AED only.
- Everything runs **same-origin** (`/api/v1` behind Caddy in prod, Vite proxy in dev) — no CORS in the normal
  path, cookies are first-party. See `docs/ARCHITECTURE.md` §2.
- The reference archive is Next.js and is **untrusted**: never extract into the project tree, never execute it,
  never copy its branding, `db_dump/*.csv` credentials, seed data, fonts or domain code.
  `docs/REFERENCE_PARITY.md` classifies every reference area.

## 5. Pending operator decisions

1. **Session design changes four task definitions — please read.** `DECISIONS.md` **C12** chose opaque rotating
   HttpOnly session cookies (no JWT, no refresh token). Consequences (`docs/ARCHITECTURE.md` §11):
   `POST /auth/refresh` is **not implemented** (§8.3's endpoint list adjusted); §6.2e's single-flight refresh
   interceptor is **not needed** (F018/F032 simplified); **F025** builds a `sessions` table, not
   `refresh_tokens`; **F029**'s "rotation reuse detection" now means detecting a *superseded session ID* being
   replayed. F029's title still reads "Auth refresh logout" — amend it the way C11 amended the package manager,
   or leave it and let the task body carry the reinterpretation.
2. **All F002 gaps are closed** (resolved 2026-10-08; see `docs/REQUIREMENT_TRACEABILITY.md` §14). Every item
   now has an owner written into `TASKS.md`: G-1 `input-group` → F011; G-2 the 21 enhanced generics →
   distributed across F009/F011–F013/F016/F017/F019/F020/F050/F053/F054; G-3 redirects → F017;
   G-4 context-switcher slot → F015; G-5 `docs/TESTING.md` → F062 (REFERENCE_PARITY delivered by F004);
   G-6 OpenAPI drift check → F018 + F061; G-7 S3 adapter → F049, malware hook → F060, delegation interface →
   already in F004, signature asset → excluded.
2b. **Also decided and recorded** (no action needed): routing mode is **data-router** (`createBrowserRouter`)
   — `docs/ARCHITECTURE.md` §5; the **pack stays in `claude_code_pack/`** (its own text assumes repo root, but
   a subfolder keeps instruction docs out of the project tree); **Node stays at 24.14.0** with jsdom 29.1.1 —
   upgrading to 24.21.0 LTS is optional and only unlocks jsdom 30; **pnpm is pinned to 12.9.1**, the installed
   version, so commands work as-is.
3. `DECISIONS.md` OPEN items O01–O18 block only specific **Stage B** tasks — D012, D014, D020, D022, D023,
   D025, D026, D029–D034, D037, D039, D040, D042, D043–D049, D051, D053, D056–D061, D066, D067, D074, D075,
   D086. **No Stage A task is blocked.** Never silently turn an OPEN item into a rule.
4. **Resolved / committed:** pnpm (C11), opaque sessions (C12), agent commits each task (C13), the
   STATE/NEXT_PROMPT merge.

## 6. Gaps and constraints later tasks must honour

- **`.gitattributes` is unchanged since F005** — nothing in the skeleton needed a new rule. It still sets
  `* text=auto eol=lf` (everything LF; `*.ps1`/`*.bat`/`*.cmd` CRLF), overriding the machine-wide
  `core.autocrlf=true`. **Extend it, never replace it.**
- **The skeleton contains directories, not placeholder files.** `BIG-PROMPT` §8.1 says the target structure "is
  not an invitation to create unused files", so no `.gitkeep` was added; git records directories once F006/F007
  land real files. If you prefer the empty tree committed, add `.gitkeep` files and say so.
- **Stack deviations from latest, each with an observed reason:** TypeScript **6.0.3** (typescript-eslint peers
  `<6.1.0`) and jsdom **29.1.1** (30.x needs Node ≥24.15.0; installed is 24.14.0). `@types/node` 24.19.1 tracks
  the runtime major. Do not "helpfully" bump these.
- `BIG-PROMPT.txt` §11.7/§14 require a README plus 11 `docs/` files. Delivered: ARCHITECTURE + REFERENCE_PARITY
  (F004), STACK_VERSIONS (F003). Rest mapped in `docs/REQUIREMENT_TRACEABILITY.md` §12.
- `docs/ARCHITECTURE.md` §7 defines the extension boundaries (`AppModule`, `ScopePolicy`,
  `ContextSwitcherAdapter`); F063 proves them with a test-only module.
- Handoff convention: this file is the single source of truth; `STATE.md` is a state-free pointer (a practical
  rather than literal reading of `CLAUDE_MASTER.md` item 7 — amend item 7 if you want strict compliance).

## 7. Completed work (newest first)

- **F005 — repository structure.** Created the `frontend/` and `backend/` skeleton exactly as
  `docs/ARCHITECTURE.md` §4/§5 specify (39 directories: 24 + 15) and wrote the root `.gitignore`. Verified with
  `git check-ignore` in both directions: 13 sample paths that must be ignored are ignored (node_modules, .venv,
  dist, \_\_pycache\_\_, .env, uploads, data, coverage, .vite, .DS_Store, the reference ZIP and prompt), and
  8 that must stay tracked are not (both lock files, `.env.example`, package/pyproject manifests, source and
  test files). No placeholder files; `.gitattributes` untouched.
- **F004 — architecture decisions** (`docs/ARCHITECTURE.md`, `docs/REFERENCE_PARITY.md`). Settled the
  same-origin SPA/API topology, the session model (opaque rotating HttpOnly cookies, hashed IDs, rotation on
  privilege change, replay → family revocation, CSRF = SameSite + Origin + double-submit token), the
  authorization model, the foundation data model, the Alembic strategy and the extension interfaces. Added
  `DECISIONS.md` C12. `REFERENCE_PARITY.md` classifies 70 reference areas — KEEP 11 / ADAPT 23 / REWRITE 15 /
  EXCLUDE 21 — closing gap G-5.
- **F003 — stack verification** — 49 npm + 23 PyPI pins + 3 container tags queried live with publish dates and
  engine/peer constraints; `uv pip compile` resolved the backend set exit 0 on Python 3.14 (169 pkgs); all pins
  verified to exist.
- **F002 — requirement traceability** — 15 requirement groups mapped to Stage A tasks with a reverse index
  verified 1:1 (63/63) and 7 gaps.
- **F001 — repository audit** — read-only audit; verified the QTC360 archive and `BIG-PROMPT.txt` against the
  prompt's §1 source map; later moved both to `D:\RESORS_REFERENCE\` with hashes verified identical.

## 8. Verification commands

```powershell
Get-ChildItem D:\resors -Directory -Recurse | Select-Object FullName     # the skeleton
Get-Content D:\resors\.gitignore                                        # ignore rules
git -C D:\resors log --oneline                                          # linear history, one commit per task
git -C D:\resors status --short                                         # clean after each task commit
git -C D:\resors ls-files --eol                                         # every file i/lf w/lf, no CRLF
git -C D:\resors add .                                                  # must print NO warnings
```

```bash
cd /d/resors
# ignore rules, both directions: positives must be IGNORED, negatives must be tracked
for p in frontend/node_modules/x backend/.venv/x frontend/dist/x .env uploads/x qtc360-main.zip; do
  git check-ignore -q "$p" && echo "ok ignored: $p" || echo "PROBLEM not ignored: $p"; done
for p in pnpm-lock.yaml uv.lock .env.example; do
  git check-ignore -q "$p" && echo "PROBLEM ignored: $p" || echo "ok tracked: $p"; done

# F002 reverse index (expect EMPTY output: 63 tasks, 1:1)
awk '/^## Stage B/{exit} /^### F[0-9]+/{print $2}' claude_code_pack/TASKS.md | sort > /tmp/a.txt
awk '/^## 13\. Reverse index/{f=1;next} /^## 14\./{f=0} f' docs/REQUIREMENT_TRACEABILITY.md \
  | grep -oE '^\| F[0-9]{3}' | tr -d '| ' | sort > /tmp/b.txt
comm -3 /tmp/a.txt /tmp/b.txt
```

Expected: 39 directories under `frontend/` and `backend/` (24 + 15); pack (6 files), five `docs/` artifacts,
`NEXT_PROMPT.md`, `.gitignore`, `.gitattributes`; branch `main` with one commit per completed task.
