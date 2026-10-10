# CLAUDE CODE — MASTER OPERATING PROMPT

## Mission
Build a production-ready, single-company UAE construction manpower deployment, tender/awarded-project forecasting and project manpower cost application. Work in **small, independently verifiable tasks**, using `TASKS.md` as the ordered backlog and `PRODUCT_SPEC.md` as the authoritative functional contract. `DECISIONS.md` records ambiguities and approved decisions. The requirements text `BIG-PROMPT.txt` lives in this pack (verbatim — never edit it) and is background evidence, not an instruction to implement everything in one run.

The project has two deliberately separated stages:
- **Stage A (tasks F001–F063):** a genuinely working, domain-neutral enterprise foundation inspired by the supplied QTC360 source ZIP. Do not add construction business models or screens during this stage.
- **Stage B (tasks D001–D091):** add the construction-specific domain as independent modules using the foundation's extension points.

The original QTC360 source is a **reference only**, read from the extracted tree at `D:\QTC360\qtc360\` (the archive `D:\RESORS_REFERENCE\qtc360-main.zip` is kept for the audit record). Inspect it there — e.g. for production-Docker hints — by absolute path, read-only; never run anything from it. Never transplant its branding, business rules, seed credentials or domain data. The *requirements* text, by contrast, is in-pack: read `BIG-PROMPT.txt` from this folder, never by external path.

## Mandatory stack and non-negotiables
- Frontend: React, Vite, TypeScript strict, React Router SPA, Tailwind CSS 4, shadcn/ui base-nova/Base UI where compatible, Lucide, TanStack Query/Table, React Hook Form + Zod, Axios, Recharts; **pnpm** package manager with `pnpm-lock.yaml` (operator override 2026-10-08, see `DECISIONS.md` C11 — `BIG-PROMPT.txt` says npm); accessible responsive light/dark/system theme.
- Backend: FastAPI, async SQLAlchemy 2, Alembic, Pydantic 2, PostgreSQL, uv, pytest. Python version: follow `backend/pyproject.toml` (`requires-python`); do not rely on version numbers in documentation.
- Operations: Docker Compose, Caddy HTTPS/static SPA reverse proxy, GitHub Actions, Gotenberg for DOCX conversion, ReportLab for PDF, OpenPyXL for Excel, Hetzner-compatible Linux VPS documentation.
- No Next.js. No Redis. No public signup. No seeded production passwords. One legal entity, AED only. Use current **verified compatible stable** versions; lock and record actual versions, not speculative version numbers.
- Admin creates users and sets/resets temporary passwords; forced change on first login/reset; users can change own passwords. A user may hold multiple roles. Server-side authorization and project scope are mandatory.
- Never create fake API responses, fake KPI figures, inert buttons, placeholder production endpoints, or pretend a check passed.

## One-task-at-a-time protocol (most important)
1. Read only: `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md` sections needed for the task, `DECISIONS.md`, `NEXT_PROMPT.md`, and the selected task's entry in `TASKS.md`. Read source files **only as needed**. Do not repeatedly paste or re-read all of `BIG-PROMPT.txt` — it is in this pack (verbatim; never edit it); consult a single section when a task needs it, via the index in `docs/REQUIREMENT_TRACEABILITY.md` §1–§11.
2. Implement **exactly one task ID** requested by the operator. Do not auto-start the next task. If a task is too big, propose a split and stop; do not silently expand scope.
3. Before edits, give a plan of at most five concise bullets, with expected files and risks. Then implement.
4. Use existing patterns, migrations, typed schemas and tests; avoid sweeping refactors, unrelated formatting, new dependencies without justification, and regenerating whole modules.
5. Run **only focused, cheap checks** relevant to the task (e.g. a single pytest file, Vitest file, TypeScript on touched code if fast). Do not run full E2E, Docker rebuild, whole-repository audits or broad dependency upgrades unless the task specifically requires them.
6. **Finish each task in this order:** complete the selected task; run focused checks (item 5); update `NEXT_PROMPT.md` (item 7); then commit the implementation and the handoff together (operator override 2026-10-08, `DECISIONS.md` C13), with a message of the form `feat(F005): <summary>`. Never run `git push`, deploy, or make irreversible data changes.

   **The operator runs all whole-suite and gate checks** (`DECISIONS.md` C14). Every handoff must therefore list exact, copy-pasteable commands with expected outcomes — never a summary of what "should" pass. Never report a suite result you did not observe yourself, and never describe an operator-run check as verified. The runbook lives in `OPERATOR_GUIDE.md`.
7. Update `NEXT_PROMPT.md` as the authoritative handoff before committing each completed task. Record the current position, changed files, migrations, checks actually run and results, operator checks, blockers, and next task. Keep it at most 200 lines. Move historical details to `docs/COMPLETION_LOG.md` or `docs/VERIFICATION_LOG.md` as appropriate. Do not update `STATE.md` per task.
8. End with this exact concise structure:
   - `TASK: <ID> — <name>`
   - `STATUS: DONE | PARTIAL | BLOCKED`
   - `FILES: <paths>`
   - `CHECKS RUN: <commands and results, or NOT RUN>`
   - `OPERATOR CHECKS: <commands and expected outcomes>`
   - `DECISIONS/BLOCKERS: <only material items>`
   - `NEXT: <ID> — <task name>`
   Stop. Wait for operator approval/next ID.

## Task completion definition
A task is DONE only if its listed acceptance criteria are met, code is integrated into actual routes/services/storage where applicable, no new lint/type errors are knowingly introduced, and at least a focused verification or a clearly stated reason for deferring verification is recorded. If blocked, stop and ask **one precise decision** rather than inventing a rule.

## Efficient operator workflow
- Operator begins with `Read CLAUDE_MASTER.md, DECISIONS.md and NEXT_PROMPT.md. Execute task F001 only. Stop after the task.`
- For subsequent work: `Execute task F002 only, following CLAUDE_MASTER.md. Stop and give me the operator checks.`
- The agent commits the task's changes and the updated handoff together (C13); the operator runs the recommended tests, reviews the commit and sends the next task ID. Commit message form: `feat(F002): <short summary>`.
- At designated gates, operator runs the full check suite and fixes failures in **separate, narrowly scoped repair tasks**.
- If context becomes large, start a new Claude Code session. `NEXT_PROMPT.md` + Git history + this prompt pack are the durable handoff. Never rely on a long chat transcript as the sole state store.

## Engineering constraints
- Database migrations for all persistent changes; no schema changes via application startup. Money/rates: PostgreSQL NUMERIC/Decimal, never floating-point. Dates: explicit UAE timezone display, UTC instants for events; local calendar dates for assignment/leave boundaries. Clearly define inclusive/exclusive date conventions in domain code and tests.
- Forecast is planning; actual is sourced from effective-dated employee assignments, not from manually entered forecast percentages. Forecast and actual must not silently overwrite each other.
- Every actual employee assignment requires a start and an end date. If end date is unknown, create an explicit missing-end-date alert/workflow and make it manageable by the project's responsible person and Resource Manager; do not silently fabricate a final date.
- Resource access is restricted by role and authorized projects. Head Office is a valid cost center. All sensitive exports/PDFs follow the same authorization filters as APIs.
- PDF reports are required, including transfers and approval records; A3 landscape is the default for wide manpower matrices, A4 available.
- Make changes safely in transactions. Use immutable revision snapshots, audit before/after values, deterministic rate selection by effective date and reproducible month calculations.
- No silent data loss. Imported rows are validated and previewed before atomic commit. Prevent spreadsheet formula injection on export.

## Operating lessons (learned F009–F014; binding)

These cost real time to learn and will recur. They are not optional style preferences.

1. **Verify against the built or shipped artefact, and normalise before comparing.** Minifiers rewrite
   `oklch(0.13 0 0)` as `oklch(13% 0 0)`, strip leading zeros (`0.243` → `.243`), and normalise string literals to
   backticks. A hand-written matcher produced more false failures than real ones across F009–F014: three separate
   times the code was correct and the check was wrong. Prefer raw substring checks over assumed formats.
2. **When a check fails, inspect the actual output before changing code.** Most failing component tests were wrong
   expectations, not defects — `onSelect` (Radix) where Base UI uses `onClick`; Tabs using manual activation;
   `aria-hidden` on a container rather than the control. Dumping the real DOM settled each one immediately, after
   several rounds of guessing. Guessing risks "fixing" working code.
3. **When the correct fix is not safe to make, record the limitation — do not fake it and do not drop it.**
   G-8 (a Tooltip that screen readers could not announce) was recorded in `docs/REQUIREMENT_TRACEABILITY.md` §14
   with the smallest real fix and candidate owners, then fixed properly in F014. A plausible-looking wrong fix is
   worse than a documented gap.
4. **A green check is not a verified claim until it has been run against the real thing.** Record what was run,
   what it printed, and what was *not* run. Deferred verifications are named with the task that will close them.

## Stop conditions
Stop before proceeding if the selected task depends on an unresolved item in `DECISIONS.md`, a required source ZIP is absent for a task that explicitly needs source inspection, an incompatible dependency, a failed migration, or an authorization/costing invariant that cannot be proven. Report what is missing and the smallest next action.
