# Implementation log — gate evidence

`claude_code_pack/TASKS.md` §Gate checkpoints: after **F016, F032, F048, F063, D018, D036, D063, D078, D091**
the **operator** runs the broader checks and records the evidence here. This file is the gate ledger and nothing
else — per-task history belongs to `claude_code_pack/DECISIONS.md` and `docs/ARCHITECTURE.md`, and the command
recipes belong to `docs/VERIFICATION_LOG.md` and `claude_code_pack/OPERATOR_GUIDE.md`.

The runbook for running a gate is `claude_code_pack/OPERATOR_GUIDE.md` §Gates.

## The rule that keeps this file honest

A gate is passed or it is not. **A red item is never waived into the record**: it becomes a fix task, the gate is
re-run once that task lands, and only then is the gate marked passed. An entry reading "passed, with a known
issue we accept" is exactly the debt the gate exists to prevent — if an issue is genuinely acceptable, that is an
operator decision written down as an accepted waiver with a reason and an owner, and the gate is still marked
against what it was supposed to prove.

Counts are recorded **as observed on the day**, never copied from `NEXT_PROMPT.md` or from a previous entry.
Record the commit hash the gate ran against: a result against an unknown tree proves nothing.

## Entries

### G-A1 — after F016 (Phase 1: skeleton, design language, routing)

**Status: no separate run recorded.** Scope (BP-12-P1): apps boot, build/typecheck/lint clean, the token theme
and the routes work. Every command that covers it exists today and is listed in the runbook, so the scope is
covered by the standing matrix — but no dated run of it is recorded here.

### G-A2 — after F032 (Phase 2: database, authentication, RBAC)

**Status: no separate run recorded.** Scope (BP-12-P2): bootstrap, the forced password change, multi-role
behaviour, 401/403, and no privilege escalation. The server side of this scope is continuously exercised by the
backend integration leg (C16–C19 are its decisions), and G-A3's denial row re-checks the browser side; no dated
run of the gate as such is recorded here.

### G-A3 — after F048 (Phase 3: admin, profile, preferences, DataTable)

**Status: DUE — not yet run.** The task that opens the gate (F048) landed, and F049–F057 followed it, so the
tree the gate must judge is the current head rather than F048's own commit.

Scope (BP-12-P3): the real admin pages, profile, preferences, the full DataTable — and the routes/states that
carry them. The runbook's Blocks A and B plus its by-hand walkthrough are the check; nothing is recorded until
the operator runs it.

### G-A4 — after F063 (Phase 7: foundation handoff)

**Status: not reached.** Scope (BP-12-P7 + BP-13): the extension contract exercised by a test-only module and
then removed or isolated, plus the 21-item definition-of-done checklist, the production Compose boot, and the
"no Next.js / no Redis" check.

## Entry template

```markdown
### G-xx — after Fxxx (<phase scope>) — YYYY-MM-DD

Commit: <hash> (<subject>), tree clean
Ran: <command> → <observed output/exit>; <command> → <observed output/exit>
By hand: <what was walked in the browser, and what it showed> (or "n/a for this gate")
Findings: <each red item, the fix task it became, and the re-run that followed> | none
Waivers: <accepted issue + reason + owner> | none
Verdict: PASSED | FAILED
```
