# CURRENT IMPLEMENTATION STATE

**This file is a pointer. Read `D:\resors\NEXT_PROMPT.md` instead — it is the single cold-start handoff.**

Why: `CLAUDE_MASTER.md` (protocol item 7) requires `STATE.md` to be updated after every task, and
`NEXT_PROMPT.md` carried the same state plus the paste-ready next instruction. Keeping both in full duplicated
roughly 60% of their content, made the always-read set ~18.6 KB per session, and twice left stale claims in one
file after the operator committed. On 2026-10-08, at operator request, they were merged: `NEXT_PROMPT.md` is the
single source of truth and is the only file that must be updated per task.

`NEXT_PROMPT.md` holds everything this file used to: current stage and position, the completed-task log, the
committed files and checks actually run, blockers, open operator decisions, environment facts, carried-forward
constraints, and the verification commands. Task artifacts live in `D:\resors\docs\`.

This file is intentionally free of state so it can never drift out of date.
