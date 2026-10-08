# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the cold-start handoff: it says where the project stands and what to do next.
> Last updated: 2026-10-08 — after task F003.

**Rule for Claude Code: update this file at the END of each completed task** (and whenever an operator
instruction changes project state materially), together with `claude_code_pack/STATE.md`. Keep it short, true and
current. Never record a check as passed unless you ran it. If a task is abandoned or blocked, say so here rather
than leaving the previous state looking current.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md,
claude_code_pack/STATE.md, docs/STACK_VERSIONS.md and task F004 in
claude_code_pack/TASKS.md. Implement F004 only. Follow the one-task protocol.
Do not commit. Update NEXT_PROMPT.md and claude_code_pack/STATE.md at the end,
then stop and give me the operator checks.
```

Replace `F004` with the next ID from §3 when it changes. Follow the pack's own efficiency rules: read only the
spec sections the task needs, and do not re-read all of `BIG-PROMPT.txt`.

## 2. Where things are

| What | Path |
|---|---|
| Project root (this repo) | `D:\resors` |
| Instruction pack | `D:\resors\claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md`, `STATE.md` |
| Task artifacts | `D:\resors\docs\REPOSITORY_AUDIT.md` (F001), `D:\resors\docs\REQUIREMENT_TRACEABILITY.md` (F002), `D:\resors\docs\STACK_VERSIONS.md` (F003) |
| Reference material (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip`, `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |
| Unrelated, do not touch | `D:\QTC360\` — a separate QTC360 working area |

Reference inputs are deliberately outside the repo so they can never be committed. Read them by absolute path;
an out-of-folder read may raise a permission prompt, which is expected. Expected hashes:
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed task: **F003 — stack verification** (artifact: `docs/STACK_VERSIONS.md`).
- **Next task: F004 — architecture decisions.** Document the SPA/API/session approach and the extension
  boundaries; acceptance is an architecture diagram and interfaces. F004 owns the session-strategy decision
  (BP-6.2a) and the `ScopePolicy` / `AppModule` boundary that everything else hangs off.
- Last human verification: **NOT RUN** — the operator has not yet run the F001 checks or committed anything.
- Git: branch `main`, `.git` at `D:\resors\.git`. The operator made the first commit
  **`f386964 "working with requirements"`**, following `51aca2e "prepare the prompts"`. F002's artifact is
  in history. **F003's output is uncommitted**: `docs/STACK_VERSIONS.md` is untracked, and six files are
  modified — `NEXT_PROMPT.md`, `claude_code_pack/{STATE,CLAUDE_MASTER,DECISIONS,OPERATOR_GUIDE,TASKS}.md`
  (the last four carry the pnpm override C11). Committing them is the operator's call.

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

0. **Resolved this session:** frontend package manager is **pnpm**, not npm — operator override recorded as
   `DECISIONS.md` **C11**; `CLAUDE_MASTER.md`, `TASKS.md` (F061) and `OPERATOR_GUIDE.md` were amended to
   match. `BIG-PROMPT.txt` (outside the repo) still says npm and is now superseded on this point. Backend
   stays on `uv` as the pack already required.

1. **Commit F003's output** against baseline `f386964` — `docs/STACK_VERSIONS.md` (new) plus the modified
   handoff files and the four pack files carrying the pnpm override. Note this commit *changes the contract*
   (`DECISIONS.md` C11), so it is worth reading the C11 diff before approving. F001's operator checks have
   still never been run by a human.
2. Whether the pack stays in `claude_code_pack/` or moves to the repo root (the pack's own instructions assume
   root; `OPERATOR_GUIDE.md` also refers to placing the pack alongside `BIG-PROMPT.txt`, which is now moot).
3. Whether `NEXT_PROMPT.md` itself should be committed or kept out of version control.
4. `DECISIONS.md` holds OPEN items O01–O18. They block only specific **Stage B** tasks; per the register's
   "Blocking tasks" column the affected set is D012, D014, D020, D022, D023, D025, D026, D029–D034, D037,
   D039, D040, D042, D043–D049, D051, D053, D056–D061, D066, D067, D074, D075, D086. **No Stage A task is
   blocked by an open decision.** Never silently turn an OPEN item into a rule.
5. **Seven mapping gaps found by F002** — see `docs/REQUIREMENT_TRACEABILITY.md` §14. None blocks F003; each
   needs a small decision or a note in the owning task:
   G-1 `input-group` primitive unowned (F011 or F019); G-2 the 21 "enhanced generic" components of BP-5.2b are
   unnamed; G-3 `/` and `/admin` redirects unowned (F017?); G-4 `WorkspaceContext` + context-switcher slot
   unowned; G-5 `docs/TESTING.md` and `docs/REFERENCE_PARITY.md` required by §14 but named in no task;
   G-6 the OpenAPI typed-client drift check appears only in **D084 (Stage B)**; G-7 optional items
   (signature asset, delegation interface, S3 adapter, malware-scan hook) have no owner.

## 6. Gaps later tasks must cover

- `BIG-PROMPT.txt` §11.7/§14 require a project README plus 11 `docs/` files (ARCHITECTURE, ROUTES_NAVIGATION,
  STACK_VERSIONS, SECURITY, DEPLOYMENT, BACKUP_RESTORE, ADDING_A_MODULE, TESTING, REFERENCE_PARITY,
  OPENAPI_CLIENT, IMPLEMENTATION_LOG). **F002 mapped each to its producing task** — see
  `docs/REQUIREMENT_TRACEABILITY.md` §12 — except TESTING/REFERENCE_PARITY/OPENAPI_CLIENT, which are gaps
  G-5/G-6 in §5 above.
- F005 creates the `frontend/backend/docs` skeleton and ignore rules. The archive no longer needs ignoring
  (it is outside the tree); ordinary build artefacts still do.
- **Stack is pinned but nothing is installed.** `docs/STACK_VERSIONS.md` is the single source of truth for
  versions; F006/F007 pin them into the manifests and generate `pnpm-lock.yaml` / `uv.lock`. Key choices:
  React 19.3.0, react-router 8.4.0, Vite 8.3.4, Tailwind 4.3.3, **TypeScript 6.0.3** (not 7 — typescript-eslint
  peers `<6.1.0`), **jsdom 29.1.1** (not 30 — Node 24.14.0 is below its ≥24.15.0 floor), Python **3.14**,
  `postgres:18.6-alpine`, `caddy:2.11.7-alpine`, `gotenberg/gotenberg:8.37`, and **pnpm** for the frontend.
- **Line endings — resolved, but read this before touching the file:** this machine has
  `core.autocrlf=true` system-wide (Git for Windows default), which would check files out as CRLF and break
  Linux/Docker builds. A root `.gitattributes` now sets `* text=auto eol=lf` (plus explicit rules for
  scripts/Dockerfile/Caddyfile, CRLF for `*.ps1`/`*.bat`/`*.cmd`, and `binary` for images/fonts/office files).
  Attributes override `core.autocrlf`, so the warnings stop and everything is LF in both the index and the
  working tree. **F005 should extend this file, not overwrite it.**

## 7. Recently completed (newest first)

- **F003 — stack verification.** Built `docs/STACK_VERSIONS.md` from live registry queries: 49 npm + 23 PyPI
  pins + 3 container tags, each with publish date and engine/peer constraints. Proved: `uv pip compile`
  resolves the whole backend set on Python 3.14 (exit 0, 169 packages); every pin exists. Three documented
  deviations from latest (TypeScript 6.0.3, jsdom 29.1.1, `@types/node` 24.19.1) each with an observed
  reason. Applied the pnpm override to the pack. No installs, no build.

- **F002 — requirement traceability.** Built `docs/REQUIREMENT_TRACEABILITY.md`: 15 requirement groups mapping
  BIG-PROMPT §0–§14 and PRODUCT_SPEC §2 to Stage A tasks, the required-document map, a full per-task reverse
  index, and 7 gaps. Verified 1:1 against `TASKS.md` (63 tasks both ways) and scanned for domain leakage
  (none). Read-only apart from the new doc.
- **Line-ending policy fixed** (operator reported `git add` warnings) — added root `.gitattributes` with
  `* text=auto eol=lf`; renormalised the index. Verified with `git ls-files --eol`: every file is `i/lf w/lf`,
  and a repeat `git add .` produces no warnings. Nothing committed.
- **Repository initialised** (operator request) — `git init -b main` at `D:\resors`. Since committed as
  `51aca2e`, and F001's audit + F002's traceability were committed in `f386964`; see §3 for current state.
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
Get-ChildItem D:\resors -Recurse -File | Select-Object FullName, Length   # pack + docs/ + handoff files
Get-Content D:\resors\docs\STACK_VERSIONS.md -TotalCount 12               # F003 artifact
Get-Content D:\resors\docs\REQUIREMENT_TRACEABILITY.md -TotalCount 12     # F002 artifact
(Get-FileHash D:\RESORS_REFERENCE\qtc360-main.zip -Algorithm SHA256).Hash.ToLower()
(Get-FileHash D:\RESORS_REFERENCE\BIG-PROMPT.txt  -Algorithm SHA256).Hash.ToLower()
git -C D:\resors rev-parse --is-inside-work-tree                          # -> true
git -C D:\resors log --oneline                                            # 51aca2e "prepare the prompts", f386964 "working with requirements"
git -C D:\resors status --short                                           # 1 untracked doc + 2 modified handoff files
git -C D:\resors ls-files --eol                                           # every file i/lf w/lf, no CRLF
git -C D:\resors add .                                                    # must print NO warnings
```

Re-run the F002 evidence checks (bash):

```bash
cd /d/resors
awk '/^## Stage B/{exit} /^### F[0-9]+/{print $2}' claude_code_pack/TASKS.md | sort > /tmp/a.txt
awk '/^## 13\. Reverse index/{f=1;next} /^## 14\./{f=0} f' docs/REQUIREMENT_TRACEABILITY.md \
  | grep -oE '^\| F[0-9]{3}' | tr -d '| ' | sort > /tmp/b.txt
comm -3 /tmp/a.txt /tmp/b.txt        # must be EMPTY: 63 tasks, 1:1 both directions
grep -icE 'designation|employee|tender|discipline|manpower|assignment|cost cent' \
  docs/REQUIREMENT_TRACEABILITY.md   # 1 = only "role assignment" in an RBAC row
```

Expected: the pack (6 files), `docs\REPOSITORY_AUDIT.md`, `docs\REQUIREMENT_TRACEABILITY.md`, `NEXT_PROMPT.md`,
`.gitattributes`; hashes as in §2; branch `main` with HEAD `f386964` and F003's output uncommitted.
