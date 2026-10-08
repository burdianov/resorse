# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the cold-start handoff: it says where the project stands and what to do next.
> Last updated: 2026-10-08 — after task F001 (including the reference-material move).

**Rule for Claude Code: update this file at the END of every step or task, before your final message.**
Keep it short, true and current. Never record a check as passed unless you ran it. If a step is abandoned or
blocked, say so here rather than leaving the previous state looking current.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md,
claude_code_pack/STATE.md and task F002 in claude_code_pack/TASKS.md.
Implement F002 only. Follow the one-task protocol. Do not commit.
Update NEXT_PROMPT.md and claude_code_pack/STATE.md at the end, then stop and
give me the operator checks.
```

Replace `F002` with the next ID from §3 when it changes. Follow the pack's own efficiency rules: read only the
spec sections the task needs, and do not re-read all of `BIG-PROMPT.txt`.

## 2. Where things are

| What | Path |
|---|---|
| Project root (this repo) | `D:\resors` |
| Instruction pack | `D:\resors\claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md`, `STATE.md` |
| Task artifact (F001) | `D:\resors\docs\REPOSITORY_AUDIT.md` |
| Reference material (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip`, `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |
| Unrelated, do not touch | `D:\QTC360\` — a separate QTC360 working area |

Reference inputs are deliberately outside the repo so they can never be committed. Read them by absolute path;
an out-of-folder read may raise a permission prompt, which is expected. Expected hashes:
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed task: **F001 — repository audit and availability** (artifact: `docs/REPOSITORY_AUDIT.md`).
- **Next task: F002 — requirement traceability.** Maps supplied foundation requirements to modules/tasks;
  acceptance is a traceability table with no domain modules.
- Last human verification: **NOT RUN** — the operator has not yet run the F001 checks or committed anything.
- Git: repository **initialised on branch `main`** (2026-10-08), `.git` at `D:\resors\.git`.
  **No commits yet; 9 files are staged as new** (`.gitattributes`, `NEXT_PROMPT.md`, the 6 pack
  files, `docs/REPOSITORY_AUDIT.md`). The commit itself is the operator's to make.

## 4. Environment facts a new session needs

- Windows 11; project is PowerShell-first, Bash (Git Bash/MSYS2) also available. `unzip`, `git` 2.49,
  `node` v24.14.0, `npm`, `uv` present. Python via `py -0`: 3.14 default, **3.12** and 3.10 installed.
- **No dependency versions are verified yet.** Exact stable versions are F003's deliverable
  (`STACK_VERSIONS`); do not assume versions from the reference archive or from prose in the pack.
- The QTC360 archive is **untrusted reference material**: never extract into the project tree, never execute
  anything from it, never copy its branding, seed credentials, `db_dump/*.csv` or domain code.
- Mandated target stack: React + Vite + TS strict SPA, Tailwind 4, FastAPI + async SQLAlchemy 2, PostgreSQL,
  uv, Alembic, Docker Compose, Caddy. **No Next.js, no Redis**, no public signup, one entity, AED only.
- The reference archive is **Next.js**; its frontend routing patterns are non-portable. Use it only as
  structure/design inspiration for stack-compatible parts.

## 5. Pending operator decisions

1. **First commit** — 9 files are staged on `main` and waiting. Until a commit exists there is no `git diff`
   baseline for review, and F001's checks have not been run by a human yet.
2. Whether the pack stays in `claude_code_pack/` or moves to the repo root (the pack's own instructions assume
   root; `OPERATOR_GUIDE.md` also refers to placing the pack alongside `BIG-PROMPT.txt`, which is now moot).
3. Whether `NEXT_PROMPT.md` itself should be committed or kept out of version control.
4. `DECISIONS.md` holds OPEN items O01–O18. They block only specific **Stage B** tasks; per the register's
   "Blocking tasks" column the affected set is D012, D014, D020, D022, D023, D025, D026, D029–D034, D037,
   D039, D040, D042, D043–D049, D051, D053, D056–D061, D066, D067, D074, D075, D086. **None block F002** —
   no Stage A task is blocked by an open decision. Never silently turn an OPEN item into a rule.

## 6. Gaps later tasks must cover

- `BIG-PROMPT.txt` §11.7/§14 require a project README plus 11 `docs/` files (ARCHITECTURE, ROUTES_NAVIGATION,
  STACK_VERSIONS, SECURITY, DEPLOYMENT, BACKUP_RESTORE, ADDING_A_MODULE, TESTING, REFERENCE_PARITY,
  OPENAPI_CLIENT, IMPLEMENTATION_LOG). `TASKS.md` names only STACK_VERSIONS and IMPLEMENTATION_LOG — **F002's
  traceability table should show where each required document is produced** so none is silently dropped.
- F005 creates the `frontend/backend/docs` skeleton and ignore rules. The archive no longer needs ignoring
  (it is outside the tree); ordinary build artefacts still do.
- **Line endings — resolved, but read this before touching the file:** this machine has
  `core.autocrlf=true` system-wide (Git for Windows default), which would check files out as CRLF and break
  Linux/Docker builds. A root `.gitattributes` now sets `* text=auto eol=lf` (plus explicit rules for
  scripts/Dockerfile/Caddyfile, CRLF for `*.ps1`/`*.bat`/`*.cmd`, and `binary` for images/fonts/office files).
  Attributes override `core.autocrlf`, so the warnings stop and everything is LF in both the index and the
  working tree. **F005 should extend this file, not overwrite it.**

## 7. Recently completed (newest first)

- **Line-ending policy fixed** (operator reported `git add` warnings) — added root `.gitattributes` with
  `* text=auto eol=lf`; renormalised the index. Verified with `git ls-files --eol`: every file is `i/lf w/lf`,
  and a repeat `git add .` produces no warnings. Nothing committed.
- **Repository initialised** (operator request) — `git init -b main` at `D:\resors`; no commits, nothing staged.
  `main` was chosen deliberately: the machine's `init.defaultbranch=master` comes from the Git for Windows
  system config, not from the operator's personal config. Rename with `git branch -m <name>` if unwanted.
  No `.gitignore`/`.gitattributes` yet — F005 owns those.
- **F001 — repository audit and availability.** Audited the workspace read-only; located and verified the
  QTC360 archive and later the supplied `BIG-PROMPT.txt`; cross-checked the prompt's §1 source map against the
  archive (every checkable claim matched, including the Gotenberg `:7` CI vs `:8` compose inconsistency);
  recorded the do-not-transplant list; moved both reference inputs to `D:\RESORS_REFERENCE\` at operator
  instruction (hashes verified identical before and after). No code written, nothing committed.

## 8. Verification commands for the current state

```powershell
Get-ChildItem D:\resors -Recurse -File | Select-Object FullName, Length   # pack + docs/ only
Get-Content D:\resors\docs\REPOSITORY_AUDIT.md -TotalCount 12             # F001 artifact
(Get-FileHash D:\RESORS_REFERENCE\qtc360-main.zip -Algorithm SHA256).Hash.ToLower()
(Get-FileHash D:\RESORS_REFERENCE\BIG-PROMPT.txt  -Algorithm SHA256).Hash.ToLower()
git -C D:\resors rev-parse --is-inside-work-tree                          # -> true
git -C D:\resors status --short                                           # 9 files staged as "A", no commits
git -C D:\resors ls-files --eol                                           # every file i/lf w/lf, no CRLF
git -C D:\resors add .                                                    # must print NO warnings
```

Expected: the pack (6 files), `docs\REPOSITORY_AUDIT.md`, `NEXT_PROMPT.md` and `.gitattributes`; hashes as in
§2; branch `main` with no commits yet.
