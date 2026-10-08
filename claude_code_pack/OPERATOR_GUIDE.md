# OPERATOR GUIDE — minimum-token Claude Code workflow

## Initial setup
Place this pack at the root of your new repository alongside the original `BIG-PROMPT.txt` (optional after reference audit) and the QTC360 source ZIP if you possess it. The attached text refers to `qtc360-main(2).zip`, but its presence has **not** been verified here. Do not tell Claude to inspect a missing ZIP.

Start Claude Code in the repository root. First instruction:

```text
Read CLAUDE_MASTER.md, DECISIONS.md, STATE.md and task F001 in TASKS.md.
Implement F001 only. Follow the one-task protocol and stop.
```

Subsequent instruction (replace ID):

```text
Execute F002 only. Read only the relevant spec and source files.
Do not commit, do not start F003, and give me focused operator checks.
```

At every handoff: (1) inspect diff, (2) run commands Claude lists, (3) fix failures in a dedicated repair task, (4) commit yourself, (5) update decision statuses when needed, (6) request next task. Do not ask Claude to explain the whole system every time.

## Suggested local check commands (once created)
```bash
git status --short
git diff --check
cd frontend && npm run typecheck && npm run lint && npm test -- --run
cd backend && uv run ruff check . && uv run pytest -q
# Gate only: Docker Compose integration, Playwright E2E, migration smoke, PDF tests
```
Actual scripts may vary; use documented commands from the repository. Never assume a check passed until you ran it. Full checks at stage gates, not after every one-file change.

## Gates
- G-A1 after F016: UI app boots, design tokens/components and navigation work.
- G-A2 after F032: PostgreSQL migrations, authentication, RBAC and privilege checks pass.
- G-A3 after F048: real admin pages, preferences, audit and notifications pass.
- G-A4 after F063: foundation release-ready, no domain code, production-like smoke test.
- G-B1 after D018: master data and rate history validated.
- G-B2 after D036: tender and awarded forecast/revision system verified.
- G-B3 after D063: actual assignments, transfer, leave and employee lifecycle verified.
- G-B4 after D078: cost-at-completion and consolidated capacity verified.
- G-B5 after D091: business reports, security, tests and release readiness verified.

## Context economy
Use one task per Claude session or a small number of consecutive sessions with context reset as needed. Keep only relevant sections open. Use `STATE.md` as compact checkpoint; archive logs. Prefer focused tests and explicit operator commands. Avoid generating repeated architecture essays, redundant summaries, long chain-of-thought, screenshots unless needed, and broad reformatting.

## Handling changes
When you decide a business rule, update `DECISIONS.md` first and have Claude add its acceptance tests. If a feature is larger than one small task, add subtask IDs (e.g. `D042a`) rather than combining many files and concerns. If requirements change, amend spec and tests before changing code.
