# CURRENT IMPLEMENTATION STATE

Current stage: A — domain-neutral foundation
Last completed task: F003 (stack verification)
Next recommended task: F004
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
Git: branch `main`; HEAD is `f386964 "working with requirements"` (F002's traceability), after
`51aca2e "prepare the prompts"`. **F003's output is uncommitted** — `docs/STACK_VERSIONS.md` untracked;
`NEXT_PROMPT.md`, this file, and `CLAUDE_MASTER.md`/`DECISIONS.md`/`OPERATOR_GUIDE.md`/`TASKS.md` (pnpm
override C11) modified. Root `.gitattributes` sets `* text=auto eol=lf` to override the machine-wide
`core.autocrlf=true`; **F005 must extend it, not replace it.**

## Completed tasks
- **F001 — repository audit and availability.** `docs/REPOSITORY_AUDIT.md`: evidence inventory,
  presence matrix, prompt↔archive cross-verification, do-not-transplant list, toolchain probes.
  Read-only; no code written.
- **F002 — requirement traceability.** `docs/REQUIREMENT_TRACEABILITY.md` (31 KB): 15 requirement
  groups traced from BIG-PROMPT §0–§14 and PRODUCT_SPEC §2 to Stage A tasks, the required-document
  map, a per-task reverse index, and 7 gaps. No domain module appears in it.
- **F003 — stack verification.** `docs/STACK_VERSIONS.md`: 49 npm, 23 PyPI and 3 container pins,
  each queried from the live registry with publish dates and engine/peer constraints; three
  documented deviations from absolute latest; operator override C11 (pnpm) applied to the pack.

## Latest task handoff — F003
Changed files: `docs/STACK_VERSIONS.md` (new); pack amended for the operator override —
`claude_code_pack/CLAUDE_MASTER.md` (frontend stack line), `TASKS.md` (F061 now says pnpm),
`OPERATOR_GUIDE.md` (check commands), `DECISIONS.md` (**C11** added); plus `STATE.md`,
`NEXT_PROMPT.md`.

Pinned set (evidence and reasons in `docs/STACK_VERSIONS.md`):
- Frontend: React 19.3.0, react-router 8.4.0, Vite 8.3.4, Tailwind 4.3.3, base-ui 1.8.0,
  TanStack Query 5.104.1 / Table 9.2.6, Vitest 5.0.3, Playwright 1.64.0, **pnpm** (C11).
- Deviations from latest, with observed reasons: **TypeScript 6.0.3** (typescript-eslint peers
  `<6.1.0`, so TS 7.0.2 breaks typed lint) and **jsdom 29.1.1** (30.x needs Node ≥24.15.0;
  installed is 24.14.0). `@types/node` 24.19.1 tracks the runtime major.
- Backend: **Python 3.14** (3.15 is only beta), FastAPI 0.143.0, SQLAlchemy 2.1.4, asyncpg
  0.32.0, Alembic 1.20.0, Pydantic 2.14.0, argon2-cffi 25.1.0 + PyJWT 2.15.1 (substitutions for
  the unmaintained passlib/python-jose, written reasons in the doc), Ruff 0.16.10, mypy 2.4.0.
- Containers: `postgres:18.6-alpine`, `caddy:2.11.7-alpine`, `gotenberg/gotenberg:8.37` (this
  resolves the reference's :7/:8 inconsistency).

Checks actually run:
- `uv pip compile` of the full backend set: **exit 0 on Python 3.14 (169 pkgs)** and 3.12
  (171 pkgs) — real resolver evidence, not inference.
- Existence check of every pin: 49/49 npm versions present, 23/23 PyPI releases present,
  3/3 container tags present.
- Engine/peer verification for the binding constraints (React↔Router/Table/base-ui, Vite 8 chain,
  ESLint 10 chain, Node floors) — all satisfied by Node 24.14.0 except jsdom 30.
- shadcn `base-nova` confirmed present in `ui.shadcn.com/schema.json` (the docs page is stale).
- asyncpg PostgreSQL 18 support confirmed from upstream (PG 18 CI since v0.31.0).

Blocker: none. Not yet verified (deferred, listed in the doc): SQLAlchemy/Alembic against a live
PG 18 container (F008/F023), `next-themes` inside the Vite build (F010), Caddy SPA fallback (F059).

## Open items for the operator (from F002 §14 — none blocks F004)
- G-1 `input-group` primitive has no named owner (F011 or F019).
- G-2 the 21 BP-5.2b enhanced generics are unmapped; propose folding into F017/F019/F020/F050/F053/F054.
- G-3 `/` and `/admin` redirects — confirm F017 owns them.
- G-4 `WorkspaceContext` + context-switcher slot — confirm F004 designs it, F015 hosts the slot.
- G-5 `docs/TESTING.md` → F055/F056; `docs/REFERENCE_PARITY.md` → F004 (both required by §14).
- G-6 OpenAPI typed-client drift check appears only in **D084 (Stage B)**; decide if it belongs to
  F018/F061 in Stage A.
- G-7 optional items (signature asset, delegation interface, S3 adapter, malware-scan hook).

## Notes carried into later tasks
- **F006/F007 must pin the exact versions from `docs/STACK_VERSIONS.md`** and generate
  `pnpm-lock.yaml` / `uv.lock`. `package.json` should carry a `packageManager` field (pnpm
  12.10.1 is latest; the machine has 12.9.1 — optional upgrade, no blocker).
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
