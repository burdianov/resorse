# resors — Claude Code entry point

This file is loaded automatically. It is a pointer and a summary; the detailed rules live in the sources below.
All paths are relative to the repository root.

## Authoritative sources
- `NEXT_PROMPT.md` — the authoritative current-session handoff: current position, next task, open items, operator checks.
- `claude_code_pack/CLAUDE_MASTER.md` — the engineering protocol and mandatory rules.
- `claude_code_pack/TASKS.md` — task definitions and acceptance criteria.
- `claude_code_pack/DECISIONS.md` — CONFIRMED decisions and OPEN operator decisions.
- `claude_code_pack/PRODUCT_SPEC.md` — product requirements and business rules.
- `claude_code_pack/STATE.md` — compatibility pointer only. It must not be updated after each task.

Dependency versions come only from the project's dependency files: `frontend/package.json`,
`frontend/pnpm-lock.yaml`, `backend/pyproject.toml`, and `backend/uv.lock`. Do not treat a version
written in any documentation as current.

## Session startup
At the beginning of a new task session, read `NEXT_PROMPT.md`, `claude_code_pack/CLAUDE_MASTER.md`,
and `claude_code_pack/DECISIONS.md`. Then read only the requested task entry in `claude_code_pack/TASKS.md`,
relevant sections of `claude_code_pack/PRODUCT_SPEC.md`, and source files needed for that task.

Do not automatically read the entire task backlog, product specification, historical archives, or
operator runbook.

## Go command
When the operator types "go", read `NEXT_PROMPT.md` and identify the next task ID and name.

Treat "go" as explicit authorization to implement exactly that one task, following `claude_code_pack/CLAUDE_MASTER.md`.
Before editing, present a plan of at most five concise bullets, then proceed without waiting for additional approval
unless a blocking decision or ambiguity requires operator input. Run focused checks, update `NEXT_PROMPT.md`, commit
the task and updated handoff together, then stop.

Never automatically start another task. Never push or deploy.
If `NEXT_PROMPT.md` does not identify exactly one next task, stop and ask for clarification.

## Rules
- Work on exactly one operator-requested task ID per session. Never start the next task automatically.
- Stage A (F001–F063) precedes Stage B (D001–D091). Do not add construction domain code during Stage A.
- Read only the documentation sections and source files the task needs. Do not load the archives in `docs/` in full.
- Plan in at most five concise bullets before editing.
- Run focused checks only, relevant to the task. Full-suite and gate checks belong to the operator: supply
  the exact commands and expected outcomes, and never report them as results you observed.
- Never invent passing tests or verification results. Report only what you ran and observed.
- Treat every OPEN decision in `DECISIONS.md` as unapproved. If a task depends on one, stop and ask the
  operator one precise question.
- Update `NEXT_PROMPT.md` before committing.
- Commit the implementation and the updated handoff together, using the `feat(FXXX): <summary>` form
  (`docs:` for documentation-only work).
- Never push, deploy, or make irreversible data changes automatically.
- Never read or print credentials: `LOCAL_CREDENTIALS.md`, `.env` values, or any password.

## Handoff
End each task with the seven-field block in `NEXT_PROMPT.md` §9: `TASK`, `STATUS`, `FILES`,
`CHECKS RUN`, `OPERATOR CHECKS`, `DECISIONS/BLOCKERS`, and `NEXT: <ID> — <task name>`.
Then stop and wait for the next operator instruction.
