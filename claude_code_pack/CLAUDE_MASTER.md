# CLAUDE CODE — MASTER OPERATING PROMPT

## Mission
Build a production-ready, single-company UAE construction manpower deployment, tender/awarded-project forecasting and project manpower cost application. Work in **small, independently verifiable tasks**, using `TASKS.md` as the ordered backlog and `PRODUCT_SPEC.md` as the authoritative functional contract. `DECISIONS.md` records ambiguities and approved decisions. The original `BIG-PROMPT.txt` is background evidence, not an instruction to implement everything in one run.

The project has two deliberately separated stages:
- **Stage A (tasks F001–F063):** a genuinely working, domain-neutral enterprise foundation inspired by the supplied QTC360 source ZIP. Do not add construction business models or screens during this stage.
- **Stage B (tasks D001–D091):** add the construction-specific domain as independent modules using the foundation's extension points.

The original QTC360 ZIP is a **reference only**. Inspect it if actually present in the workspace. If missing, document that fact and use the provided text-derived design description; do not pretend to have inspected its source. Never transplant its branding, business rules, seed credentials or domain data.

## Mandatory stack and non-negotiables
- Frontend: React, Vite, TypeScript strict, React Router SPA, Tailwind CSS 4, shadcn/ui base-nova/Base UI where compatible, Lucide, TanStack Query/Table, React Hook Form + Zod, Axios, Recharts; accessible responsive light/dark/system theme.
- Backend: FastAPI, Python >=3.12, async SQLAlchemy 2, Alembic, Pydantic 2, PostgreSQL, uv, pytest.
- Operations: Docker Compose, Caddy HTTPS/static SPA reverse proxy, GitHub Actions, Gotenberg for DOCX conversion, ReportLab for PDF, OpenPyXL for Excel, Hetzner-compatible Linux VPS documentation.
- No Next.js. No Redis. No public signup. No seeded production passwords. One legal entity, AED only. Use current **verified compatible stable** versions; lock and record actual versions, not speculative version numbers.
- Admin creates users and sets/resets temporary passwords; forced change on first login/reset; users can change own passwords. A user may hold multiple roles. Server-side authorization and project scope are mandatory.
- Never create fake API responses, fake KPI figures, inert buttons, placeholder production endpoints, or pretend a check passed.

## One-task-at-a-time protocol (most important)
1. Read only: `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md` sections needed for the task, `DECISIONS.md`, `STATE.md`, and the selected task's entry in `TASKS.md`. Read source files **only as needed**. Do not repeatedly paste or re-read all of `BIG-PROMPT.txt`.
2. Implement **exactly one task ID** requested by the operator. Do not auto-start the next task. If a task is too big, propose a split and stop; do not silently expand scope.
3. Before edits, give a plan of at most five concise bullets, with expected files and risks. Then implement.
4. Use existing patterns, migrations, typed schemas and tests; avoid sweeping refactors, unrelated formatting, new dependencies without justification, and regenerating whole modules.
5. Run **only focused, cheap checks** relevant to the task (e.g. a single pytest file, Vitest file, TypeScript on touched code if fast). Do not run full E2E, Docker rebuild, whole-repository audits or broad dependency upgrades unless the task specifically requires them.
6. Do **not** run `git commit`, `git push`, deploy, or make irreversible data changes. The human operator performs commits, broad test runs, deployment and final acceptance. Never claim full verification if it was delegated.
7. Update `STATE.md` with task ID, changed files, migrations, checks actually run/results, checks for operator, blockers, and next task. Keep `STATE.md` concise (prefer <=200 lines; archive old entries to `docs/IMPLEMENTATION_LOG.md`).
8. End with this exact concise structure:
   - `TASK: <ID> — <name>`
   - `STATUS: DONE | PARTIAL | BLOCKED`
   - `FILES: <paths>`
   - `CHECKS RUN: <commands and results, or NOT RUN>`
   - `OPERATOR CHECKS: <commands and expected outcomes>`
   - `DECISIONS/BLOCKERS: <only material items>`
   - `NEXT: <ID>`
   Stop. Wait for operator approval/next ID.

## Task completion definition
A task is DONE only if its listed acceptance criteria are met, code is integrated into actual routes/services/storage where applicable, no new lint/type errors are knowingly introduced, and at least a focused verification or a clearly stated reason for deferring verification is recorded. If blocked, stop and ask **one precise decision** rather than inventing a rule.

## Efficient operator workflow
- Operator begins with `Read CLAUDE_MASTER.md, DECISIONS.md and STATE.md. Execute task F001 only. Stop after the task.`
- For subsequent work: `Execute task F002 only, following CLAUDE_MASTER.md. Stop and give me the operator checks.`
- Operator runs recommended tests, reviews `git diff`, commits, and sends next task ID. Recommended commit message: `feat(F002): <short summary>`.
- At designated gates, operator runs the full check suite and fixes failures in **separate, narrowly scoped repair tasks**.
- If context becomes large, start a new Claude Code session. `STATE.md` + Git history + this prompt pack are the durable handoff. Never rely on a long chat transcript as the sole state store.

## Engineering constraints
- Database migrations for all persistent changes; no schema changes via application startup. Money/rates: PostgreSQL NUMERIC/Decimal, never floating-point. Dates: explicit UAE timezone display, UTC instants for events; local calendar dates for assignment/leave boundaries. Clearly define inclusive/exclusive date conventions in domain code and tests.
- Forecast is planning; actual is sourced from effective-dated employee assignments, not from manually entered forecast percentages. Forecast and actual must not silently overwrite each other.
- Every actual employee assignment requires a start and an end date. If end date is unknown, create an explicit missing-end-date alert/workflow and make it manageable by the project's responsible person and Resource Manager; do not silently fabricate a final date.
- Resource access is restricted by role and authorized projects. Head Office is a valid cost center. All sensitive exports/PDFs follow the same authorization filters as APIs.
- PDF reports are required, including transfers and approval records; A3 landscape is the default for wide manpower matrices, A4 available.
- Make changes safely in transactions. Use immutable revision snapshots, audit before/after values, deterministic rate selection by effective date and reproducible month calculations.
- No silent data loss. Imported rows are validated and previewed before atomic commit. Prevent spreadsheet formula injection on export.

## Stop conditions
Stop before proceeding if the selected task depends on an unresolved item in `DECISIONS.md`, a required source ZIP is absent for a task that explicitly needs source inspection, an incompatible dependency, a failed migration, or an authorization/costing invariant that cannot be proven. Report what is missing and the smallest next action.
