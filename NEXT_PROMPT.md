# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the **single cold-start handoff**; `claude_code_pack/STATE.md` is now just a pointer to it.
> Last updated: 2026-10-08 — after task F003.

**Rule for Claude Code: update this file at the END of each completed task** (and whenever an operator
instruction changes project state materially). Keep it short, true and current. Keep "Completed work" to the
last two tasks in detail and collapse older ones to one-liners — `git log` holds the rest. Never record a
check as passed unless you ran it. If a task is abandoned or blocked, say so here rather than leaving the
previous state looking current.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md,
docs/STACK_VERSIONS.md, NEXT_PROMPT.md and task F004 in claude_code_pack/TASKS.md.
Implement F004 only. Follow the one-task protocol. Do not commit.
Update NEXT_PROMPT.md at the end, then stop and give me the operator checks.
```

Replace `F004` with the next ID from §3 when it changes. Follow the pack's own economy rules: read only the
spec sections the task needs, and never re-read all of `BIG-PROMPT.txt` — jump to a section using the index in
`docs/REQUIREMENT_TRACEABILITY.md` §1–§11.

## 2. Where things are

| What | Path |
|---|---|
| Project root (repo) | `D:\resors` |
| Instruction pack | `claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md`, `STATE.md` (pointer only) |
| Task artifacts | `docs\REPOSITORY_AUDIT.md` (F001), `docs\REQUIREMENT_TRACEABILITY.md` (F002), `docs\STACK_VERSIONS.md` (F003) |
| Reference material (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip`, `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |
| Unrelated — do not touch | `D:\QTC360\` (a separate QTC360 working area) |

Reference inputs are deliberately outside the repo so they can never be committed. Read them by absolute path;
an out-of-folder read may raise a permission prompt, which is expected. Expected hashes:
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed: **F003 — stack verification** (`docs/STACK_VERSIONS.md`).
- **Next task: F004 — architecture decisions.** Document the SPA/API/session approach and the extension
  boundaries; acceptance is an architecture diagram and interfaces. F004 owns the session-strategy decision
  (BP-6.2a) and the `ScopePolicy` / `AppModule` boundary everything else hangs off.
- Git: branch `main`; HEAD `f386964 "working with requirements"` (after `51aca2e "prepare the prompts"`).
  **F003's output is uncommitted** — `docs/STACK_VERSIONS.md` untracked; `NEXT_PROMPT.md` plus
  `CLAUDE_MASTER.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md`, `TASKS.md` modified (the pnpm override C11).
- Last human verification: **NOT RUN** — the operator has never run the F001–F003 checks or reviewed a diff.

## 4. Environment facts

- Windows 11; PowerShell-first, Bash (Git Bash/MSYS2) also available. Node **v24.14.0** (LTS line is 24.21.0),
  pnpm **12.9.1** (latest 12.10.1), `uv`, git 2.49, Python 3.14 available. Docker not yet verified.
- **Stack is pinned but nothing is installed.** `docs/STACK_VERSIONS.md` is the single source of truth for
  versions; F006/F007 pin them into the manifests and generate `pnpm-lock.yaml` / `uv.lock`.
- Mandated stack: React + Vite + TS strict SPA, Tailwind 4, FastAPI + async SQLAlchemy 2, PostgreSQL, uv,
  Alembic, Docker Compose, Caddy. **No Next.js, no Redis**, no public signup, one entity, AED only.
- The reference archive is Next.js; its frontend routing patterns are non-portable. Use it only as
  structure/design inspiration for stack-compatible parts.
- The archive is **untrusted**: never extract into the project tree, never execute its contents, never copy its
  branding, `db_dump/*.csv` credentials, seed data, fonts or domain code.

## 5. Pending operator decisions

1. **Commit F003's output** against `f386964` — `docs/STACK_VERSIONS.md` plus the modified handoff and pack
   files. **This commit changes the contract** (`DECISIONS.md` C11 says pnpm where `BIG-PROMPT.txt` says npm),
   so read that diff specifically before approving.
2. Whether the pack stays in `claude_code_pack/` or moves to the repo root (the pack's own instructions assume
   root; `OPERATOR_GUIDE.md` also refers to placing the pack alongside `BIG-PROMPT.txt`, which is now moot).
3. **Seven mapping gaps found by F002** — see `docs/REQUIREMENT_TRACEABILITY.md` §14. None blocks F004:
   G-1 `input-group` primitive unowned (F011 or F019); G-2 the 21 "enhanced generic" components of BP-5.2b are
   unnamed; G-3 `/` and `/admin` redirects unowned (F017?); G-4 `WorkspaceContext` + context-switcher slot
   unowned; G-5 `docs/TESTING.md` and `docs/REFERENCE_PARITY.md` required by §14 but named in no task;
   G-6 the OpenAPI typed-client drift check appears only in **D084 (Stage B)**; G-7 optional items
   (signature asset, delegation interface, S3 adapter, malware-scan hook) have no owner.
4. `DECISIONS.md` OPEN items O01–O18 block only specific **Stage B** tasks — D012, D014, D020, D022, D023,
   D025, D026, D029–D034, D037, D039, D040, D042, D043–D049, D051, D053, D056–D061, D066, D067, D074, D075,
   D086. **No Stage A task is blocked.** Never silently turn an OPEN item into a rule.
- **Resolved:** frontend package manager is **pnpm** (`DECISIONS.md` **C11**, operator override 2026-10-08);
  `CLAUDE_MASTER.md`, `TASKS.md` (F061) and `OPERATOR_GUIDE.md` were amended to match. Backend stays on `uv`.

## 6. Gaps and constraints later tasks must honour

- **Handoff convention (merged 2026-10-08).** This file is the single handoff; `STATE.md` is a state-free
  pointer. Note this is a *practical* rather than literal reading of `CLAUDE_MASTER.md` protocol item 7, which
  asks for the per-task state to be written into `STATE.md`: the state is recorded here and `STATE.md` routes to
  it. The pack was left unamended on purpose (operator approved the pointer as a no-pack-change option). If you
  want strict compliance, amend item 7 to name this file — one line, same pattern as C11.

- **`.gitattributes` must be extended, not replaced** (F005). Everything is LF; `*.ps1`/`*.bat`/`*.cmd` stay
  CRLF. This overrides the machine-wide `core.autocrlf=true`.
- **Stack deviations from latest, each with an observed reason:** TypeScript **6.0.3** (typescript-eslint peers
  `<6.1.0`, so TS 7 breaks typed lint) and jsdom **29.1.1** (30.x needs Node ≥24.15.0; installed is 24.14.0).
  `@types/node` 24.19.1 tracks the runtime major. Do not "helpfully" bump these.
- **F006/F007 must pin the exact versions** from `docs/STACK_VERSIONS.md`; `package.json` should carry a
  `packageManager` field.
- `BIG-PROMPT.txt` §11.7/§14 require a README plus 11 `docs/` files. F002 mapped each to a producing task —
  see `docs/REQUIREMENT_TRACEABILITY.md` §12 — except TESTING / REFERENCE_PARITY / OPENAPI_CLIENT, which are
  gaps G-5/G-6 above.
- F005 creates the `frontend/backend/docs` skeleton and ignore rules. The archive needs no ignoring (it is
  outside the tree); ordinary build artefacts still do.

## 7. Completed work (newest first)

- **F003 — stack verification** (`docs/STACK_VERSIONS.md`). Queried live registries: 49 npm + 23 PyPI pins +
  3 container tags, each with publish date and engine/peer constraints. Checks actually run: `uv pip compile`
  resolved the whole backend set **exit 0 on Python 3.14 (169 pkgs)** and 3.12 (171); every pin verified to
  exist (49/49, 23/23, 3/3); binding constraints checked (React↔Router/Table/base-ui, Vite 8 chain, ESLint 10
  chain, Node floors); shadcn `base-nova` confirmed in `ui.shadcn.com/schema.json`; asyncpg PG 18 support
  confirmed upstream. Deferred, listed in the artifact: SQLAlchemy/Alembic against live PG 18 (F008/F023),
  `next-themes` in the Vite build (F010), Caddy SPA fallback (F059). No installs, no build.
- **F002 — requirement traceability** (`docs/REQUIREMENT_TRACEABILITY.md`). 15 requirement groups mapping
  BIG-PROMPT §0–§14 and PRODUCT_SPEC §2 to Stage A tasks; required-document map; per-task reverse index;
  7 gaps. Verified 1:1 against `TASKS.md` (63 tasks both ways); domain-leakage scan clean.
- **F001 — repository audit** (`docs/REPOSITORY_AUDIT.md`). Read-only workspace audit; located and verified the
  QTC360 archive and `BIG-PROMPT.txt`; cross-checked the prompt's §1 source map against the archive (every
  checkable claim matched); recorded the do-not-transplant list. Reference inputs later moved to
  `D:\RESORS_REFERENCE\` (hashes verified identical before and after).

## 8. Verification commands

```powershell
Get-ChildItem D:\resors -Recurse -File | Select-Object FullName, Length   # pack + docs/ + handoff
Get-Content D:\resors\docs\STACK_VERSIONS.md -TotalCount 12               # F003 artifact
(Get-FileHash D:\RESORS_REFERENCE\qtc360-main.zip -Algorithm SHA256).Hash.ToLower()
(Get-FileHash D:\RESORS_REFERENCE\BIG-PROMPT.txt  -Algorithm SHA256).Hash.ToLower()
git -C D:\resors log --oneline                                            # 51aca2e, f386964
git -C D:\resors status --short                                           # F003 output uncommitted
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
```

Expected: the pack (6 files), the three `docs/` artifacts, `NEXT_PROMPT.md` and `.gitattributes`; hashes as in
§2; branch `main` at `f386964` with F003's output uncommitted.
