# CURRENT IMPLEMENTATION STATE

Current stage: A — domain-neutral foundation
Last completed task: F002 (requirement traceability)
Next recommended task: F003
Last human verification: NOT RUN

Supplied inputs — both present, verified, and OUTSIDE the project folder in `D:\RESORS_REFERENCE\`
(moved by operator instruction 2026-10-08; hashes unchanged by the move, `unzip -t` clean at
the new path). Read them by absolute path; they are not in the project tree and cannot be committed.
- `D:\RESORS_REFERENCE\qtc360-main.zip`, 1,525,087 B, 517 entries,
  SHA-256 `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`
- `D:\RESORS_REFERENCE\BIG-PROMPT.txt`, 82,056 B, 622 lines, §0–§14,
  SHA-256 `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`
BIG-PROMPT §1 source map verified against the archive: every checkable claim matches.

## Active blockers
See `DECISIONS.md`; only block the specific dependent tasks. **None for F003**, and no Stage A
task is blocked by an open decision (O01–O18 are Stage B concerns).
Git: branch `main`; baseline commit `51aca2e "prepare the prompts"` (pack, F001 audit, `.gitattributes`,
`NEXT_PROMPT.md`). **F002's output is uncommitted** — `docs/REQUIREMENT_TRACEABILITY.md` untracked,
`NEXT_PROMPT.md` and this file modified. Root `.gitattributes` sets `* text=auto eol=lf` to override
the machine-wide `core.autocrlf=true`; **F005 must extend it, not replace it.**

## Completed tasks
- **F001 — repository audit and availability.** `docs/REPOSITORY_AUDIT.md`: evidence inventory,
  presence matrix, prompt↔archive cross-verification, do-not-transplant list, toolchain probes.
  Read-only; no code written.
- **F002 — requirement traceability.** `docs/REQUIREMENT_TRACEABILITY.md` (31 KB): 15 requirement
  groups traced from BIG-PROMPT §0–§14 and PRODUCT_SPEC §2 to Stage A tasks, the required-document
  map, a per-task reverse index, and 7 gaps. No domain module appears in it.

## Latest task handoff — F002
Changed files (all uncommitted against `51aca2e`): `docs/REQUIREMENT_TRACEABILITY.md` (new),
`claude_code_pack/STATE.md`, `NEXT_PROMPT.md`.

Checks actually run:
- Reverse index vs `TASKS.md`: 63 Stage A task IDs in `TASKS.md`, 63 in the reverse index, exact
  1:1 match in both directions (`comm` diff empty).
- Every `F0xx` ID used anywhere in the document resolves to a real Stage A task (63 unique, none
  outside F001–F063).
- Domain-noun scan (`designation|employee|tender|discipline|department|manpower|assignment|
  allocation|cost cent|rate history`): one hit, "role assignment" in an RBAC row — no domain
  module. Only Stage B ID referenced is D084, inside gap G-6.
- `wc -c`: 31,336 bytes.

Blocker: none.

## Open items for the operator (from F002 §14 — none blocks F003)
- G-1 `input-group` primitive has no named owner (F011 or F019).
- G-2 the 21 BP-5.2b enhanced generics are unmapped; propose folding into F017/F019/F020/F050/F053/F054.
- G-3 `/` and `/admin` redirects — confirm F017 owns them.
- G-4 `WorkspaceContext` + context-switcher slot — confirm F004 designs it, F015 hosts the slot.
- G-5 `docs/TESTING.md` → F055/F056; `docs/REFERENCE_PARITY.md` → F004 (both required by §14).
- G-6 OpenAPI typed-client drift check appears only in **D084 (Stage B)**; decide if it belongs to
  F018/F061 in Stage A.
- G-7 optional items (signature asset, delegation interface, S3 adapter, malware-scan hook).

## Notes carried into later tasks
- Reference is Next.js (App Router) + FastAPI; target is Vite SPA + FastAPI, no Redis anywhere.
- Reference domain is QA/QC + commissioning — different vertical; do not transplant branding,
  `db_dump/*.csv` credentials, seed data, fonts or domain code.
- `D:\QTC360` is a separate QTC360 working area; untouched and not needed.
- Line endings: everything is LF via `.gitattributes`; `*.ps1`/`*.bat`/`*.cmd` stay CRLF.

## Operator convention
After each task: review `git diff`, run operator checks, commit manually, then request the next ID.
At a gate, run the broader suite first. Record gate evidence in `docs/IMPLEMENTATION_LOG.md`.
Cold-start handoff: `D:\resors\NEXT_PROMPT.md` — paste-ready next instruction; update it and this
file at task completion (not after every command).
