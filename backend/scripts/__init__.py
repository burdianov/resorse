"""Operator and CI scripts, run as ``uv run python -m scripts.<name>``.

A real package rather than the namespace directory it was until F056, and for
one reason: `tests/test_coverage_gate.py` imports the gate's checking logic by
name, so `scripts/coverage_gate.py` is reachable as both `coverage_gate` (the
file) and `scripts.coverage_gate` (the import) — and mypy refuses to check a
file it has found twice under two names. The markers `__init__.py` are the
resolution mypy itself suggests, and nothing else changes: the invocation form
is the same one `export_openapi` has always used.
"""
