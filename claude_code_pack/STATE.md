# CURRENT IMPLEMENTATION STATE

Current stage: A — domain-neutral foundation
Last completed task: F001 (repository audit and availability) — revised after operator added BIG-PROMPT.txt
Next recommended task: F002
Last human verification: NOT RUN

Supplied inputs — both present, verified, and now OUTSIDE the project folder in
`D:\RESORS_REFERENCE\` (moved by operator instruction 2026-10-08; hashes unchanged by
the move, `unzip -t` clean at the new path):
- `D:\RESORS_REFERENCE\qtc360-main.zip`, 1,525,087 B, 517 entries,
  SHA-256 `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`
- `D:\RESORS_REFERENCE\BIG-PROMPT.txt`, 82,056 B, 622 lines,
  SHA-256 `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`
Read them by absolute path; they are not in the project tree and cannot be committed.
BIG-PROMPT §1 source map cross-checked against the archive: every checkable claim matches
(root folder + 2026-06-17 date, 29 UI primitives with the exact listed names, 7 DataTable
files, navigation.ts, api.ts, hooks, backend auth/admin/models/services paths, login-bg SVGs,
all quoted oklch/radius tokens, postgres:16-alpine, and Gotenberg :8 in compose vs :7 in
ci.yml). Archive == the snapshot the prompt describes.

## Active blockers
See `DECISIONS.md`; only block the specific dependent tasks. None for F002.
Not a blocker, operator action pending: the repository was initialised on branch `main`
2026-10-08 and 9 files are staged, but **nothing is committed yet** — the first commit is
still the operator's to make.

Line endings: the machine sets `core.autocrlf=true` system-wide, which broke `git add` with
"LF will be replaced by CRLF". Fixed with a root `.gitattributes` (`* text=auto eol=lf`, plus
explicit LF rules for scripts/Dockerfile/Caddyfile, CRLF for `*.ps1`/`*.bat`/`*.cmd`, and
`binary` for images/fonts/office files); the index was renormalised. `git ls-files --eol` shows
every file `i/lf w/lf` and a repeat `git add .` is warning-free. **F005 extends this file, does
not replace it.**

## Latest task handoff
**TASK F001 — Repository audit and availability — DONE**
Changed files:
- `docs/REPOSITORY_AUDIT.md` (new; revised — evidence inventory, presence matrix,
  missing-reference note, prompt↔archive cross-verification, QTC360 structure/stack/domain,
  do-not-transplant list, required-docs list for F002, reproducible commands)
- `claude_code_pack/STATE.md` (this file)

Checks actually run (read-only):
- `unzip -t` on the archive → exit 0, "No errors detected" (verified in the project folder
  and re-verified at `D:\RESORS_REFERENCE\` after the move)
- `sha256sum` on both inputs before and after the move → identical hashes, i.e. byte-exact
  rename; values above
- `unzip -Z1 | wc -l` → 517 entries (420 files / 97 dirs); ui count 29; data-table count 7
- `unzip -p` streaming (no extraction): README, backend `pyproject.toml`, frontend
  `package.json`, `globals.css` tokens, `docker-compose*.yml`, `ci.yml`, `db_dump/users.csv`
  header only, `.env.example` keys, 17 §1 source-map path existence checks
- `git rev-parse --is-inside-work-tree` → not a git repository
- `py -0`, `node --version`, tool presence probes (git, uv, npm, unzip)
No extraction to disk, no execution of archive code, no installs, no network, no tests
(nothing to test — no application source exists yet).

Blocker: none.

## Operator checks
See handoff message; expected: audit doc present, archive hash unchanged.

## Notes carried into later tasks
- QTC360 reference is Next.js (App Router) + FastAPI; mandated stack is Vite SPA + FastAPI
  (BIG-PROMPT §0.5) and no Redis anywhere (§0.6). Frontend patterns non-portable.
- Reference domain is QA/QC + commissioning — not this project's domain.
- Archive contains `db_dump/*.csv` (users with `hashed_password`, 5 rows; employees; roles;
  permissions) and 9 signature TTFs: do not transplant; BIG-PROMPT line 621 says the same.
- Archive + BIG-PROMPT.txt are no longer in the project tree, so F005's ignore rules do not
  need to cover them (ordinary build artefacts still do).
- F002 input: BIG-PROMPT §11.7/§14 require README + 11 docs files (ARCHITECTURE,
  ROUTES_NAVIGATION, STACK_VERSIONS, SECURITY, DEPLOYMENT, BACKUP_RESTORE, ADDING_A_MODULE,
  TESTING, REFERENCE_PARITY, OPENAPI_CLIENT, IMPLEMENTATION_LOG). TASKS.md names only
  STACK_VERSIONS and IMPLEMENTATION_LOG — traceability should map every required doc.
- `D:\QTC360` (separate QTC360 working area) exists outside the project folder; not
  inspected, left untouched, not needed — the relocated archive verified complete against §1.

## Operator convention
After each task: review `git diff`, run operator checks, commit manually, then request the
next ID. At a gate, run broader test suite before continuing.

Cold-start handoff: `D:\resors\NEXT_PROMPT.md` — paste-ready next instruction plus where the
project stands. **Operator requirement: update it at the end of every step or task**, together
with this file. If the two disagree, `NEXT_PROMPT.md` is the one a new session reads first, so
fix both rather than leaving the discrepancy.
