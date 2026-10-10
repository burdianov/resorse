"""The backend coverage gate (F056) — run the suite, hold three numbers (BP §10.5).

BP-10.5 asks for "coverage ≥85% core with critical auth/RBAC branches". No
single number says that, which is why this is a script rather than a
``[tool.coverage.report] fail_under`` line in `pyproject.toml` (DECISIONS C44):
coverage.py enforces **one** floor over **one** set of files, and the
requirement is about *which* modules the number belongs to. A global 85 would
be met by a well-tested report renderer while the authorization service rotted.

So this script runs pytest with branch coverage, rolls the per-file numbers up
into the groups below, and prints a table — the same columns coverage.py
prints, one row per group plus the total — then exits non-zero if any row is
under its floor.

Where the floors come from, in one place:

- **`core` — 85.** BP-10.5's own number, not one chosen to fit what the code
  happens to score. It is the shared foundation: `app/core/` (settings,
  database, security, permissions, CSRF, rate limits) and `app/services/`
  (auth, sessions, roles, users, storage, reports) — everything the API layer
  is a thin shell over, and the code BP-10.1's unit tests name one clause at a
  time.
- **`auth_rbac` — 97% of *branches*.** BP-10.5 says "critical auth/RBAC
  branches", so this row is measured on branches, not on the combined
  percentage, and the set is enumerated module by module rather than expressed
  as a directory: authentication and authorization are what an attacker
  attacks, and a half-covered `if` there is not a gap in the test suite, it is
  a hole in the wall. BP does not give this row a number; the floor is the
  F056 measurement (97.34) **rounded down**, which is the same ratchet rule the
  total uses.
- **`total` — 95.** The global ratchet, at the F056 measurement (95.64)
  rounded down, exactly as the frontend's `vite.config.ts` records its own
  (F055). It exists to make a regression visible.

**The floors may only go up.** A run that misses one is a run to fix or to
test, never a number to edit down — the frontend gate's rule, and the reason
`tests/test_coverage_gate.py` asserts that no floor sits below BP's 85.

Usage (from ``backend/``):

    uv run python -m scripts.coverage_gate            # run the suite, then judge it
    uv run python -m scripts.coverage_gate --no-run   # judge the last run's data
    uv run python -m scripts.coverage_gate -x -q      # extra arguments go to pytest

The suite needs a reachable PostgreSQL database: this is the whole backend,
both legs. On a machine without one, the database-free leg is
``uv run pytest -m "not integration"`` — but that is not this gate, and running
it here would only measure half the code.
"""

import argparse
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import coverage

BACKEND_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Numbers:
    """What coverage measured for a set of modules.

    Five counts, and three percentages derived from them exactly as
    coverage.py derives them — `percent_covered` is the report's **Cover**
    column (statements *and* branches in one fraction), which is why it is the
    number the group floors are written against.
    """

    statements: int = 0
    missing: int = 0
    branches: int = 0
    partial_branches: int = 0
    missing_branches: int = 0

    @property
    def executed(self) -> int:
        return self.statements - self.missing

    @property
    def executed_branches(self) -> int:
        return self.branches - self.missing_branches

    def _percent(self, executed: int, total: int) -> float:
        # A vacuous 100 — no statements at all — is not a passing score; the
        # caller refuses an empty group before it ever reads this. It is here
        # because 0/0 has to return *something*, and returning 100 keeps the
        # arithmetic honest for a genuinely empty file.
        return 100.0 * executed / total if total else 100.0

    @property
    def percent_covered(self) -> float:
        return self._percent(
            self.executed + self.executed_branches, self.statements + self.branches
        )

    @property
    def percent_branches(self) -> float:
        return self._percent(self.executed_branches, self.branches)


Metric = Literal["cover", "branches"]


@dataclass(frozen=True)
class Group:
    """One row of the gate table.

    `selectors` are backend-relative module paths or directory prefixes, so
    `app/core/` means the package and `app/core/csrf.py` means that one
    module. Prefix matching on the *relative* path — never on an absolute one
    — is what keeps `D:\\resors\\...` from deciding whether a module is in a
    group.
    """

    key: str
    description: str
    selectors: tuple[str, ...]
    floor: float
    metric: Metric = "cover"


AUTH_RBAC_MODULES = (
    # The primitives: hashing and verification, the permission union, the CSRF
    # double-submit, the rate-limit counters, the cookie names and flags.
    "app/core/security.py",
    "app/core/permissions.py",
    "app/core/csrf.py",
    "app/core/rate_limit.py",
    "app/core/cookies.py",
    # The services those primitives are applied by: login and its uniform
    # refusal, session rotation and reuse detection, the role matrix, password
    # policy, anti-escalation, the permission union the API asks for.
    "app/services/auth.py",
    "app/services/sessions.py",
    "app/services/permissions.py",
    "app/services/passwords.py",
    "app/services/roles.py",
    "app/services/users.py",
    # And the two places a request is admitted or turned away.
    "app/api/v1/auth.py",
    "app/api/v1/dependencies.py",
)

GROUPS = (
    Group(
        key="core",
        description="app/core/ + app/services/ - BP-10.5's 85 is the requirement's own number",
        selectors=("app/core/", "app/services/"),
        floor=85,
    ),
    Group(
        key="auth_rbac",
        description="the critical auth/RBAC branches - a ratchet, 97.34 measured at F056",
        selectors=AUTH_RBAC_MODULES,
        floor=97,
        metric="branches",
    ),
    Group(
        key="total",
        description="every measured module - the global ratchet, 95.64 measured at F056",
        selectors=("app/",),
        floor=95,
    ),
)


def relative_module(path: str) -> str:
    """A measured file as the backend sees it: `app/core/config.py`, POSIX-slashed.

    coverage.py records whatever path its own configuration produced, which on
    Windows is an absolute `D:\\resors\\backend\\app\\...`; a group selector
    written against that spelling would be a fact about this machine.
    """
    resolved = Path(path).resolve()
    try:
        return resolved.relative_to(BACKEND_ROOT).as_posix()
    except ValueError:
        # Outside the backend (a stdlib shim, a site-packages file): keep it,
        # POSIX-slashed, so it simply never matches a group's `app/` selectors.
        return resolved.as_posix()


def measure(cov: coverage.Coverage, selectors: tuple[str, ...]) -> tuple[Numbers, list[str]]:
    """Roll one group's per-file statistics up, and list the modules it matched."""
    matched: list[str] = []
    statements = missing = branches = partial = missing_branches = 0
    for path in sorted(cov.get_data().measured_files()):
        module = relative_module(path)
        if not any(module.startswith(selector) for selector in selectors):
            continue
        matched.append(module)
        _, file_statements, _, file_missing, _ = cov.analysis2(path)
        statements += len(file_statements)
        missing += len(file_missing)
        for exits, taken in cov.branch_stats(path).values():
            branches += exits
            # A branch line with *some* exits taken and some not is partial;
            # the shortfall is missing arcs either way, so both cases add to
            # `missing_branches` and only the partial ones are counted partial.
            missing_branches += exits - taken
            if 0 < taken < exits:
                partial += 1
    return Numbers(statements, missing, branches, partial, missing_branches), matched


def measured_value(group: Group, numbers: Numbers) -> float:
    """The one number a group's floor is compared against."""
    return numbers.percent_covered if group.metric == "cover" else numbers.percent_branches


def judged(group: Group, numbers: Numbers, matched: list[str]) -> str | None:
    """The failure message for one group, or `None` when it passes.

    An empty match is a failure in its own right: `Numbers._percent` answers a
    vacuous 100 for 0/0, so a selector that matches nothing — a typo, or a file
    renamed out of the set — would otherwise turn the strictest row of the gate
    into a row that can never fail.
    """
    if not matched:
        return (
            "matched no measured module — every selector is a typo or names a "
            "file coverage no longer measures, and a group with nothing in it "
            "would score 100 forever"
        )
    if not numbers.statements:
        return f"matched {len(matched)} module(s) but no statements: {', '.join(matched)}"
    measured = measured_value(group, numbers)
    if measured + 1e-9 < group.floor:
        return (
            f"{group.metric} {measured:.2f}% is below the floor of {group.floor:g}% "
            f"by {group.floor - measured:.2f} point(s) over {len(matched)} module(s)"
        )
    return None


def run_pytest(extra: list[str]) -> int:
    """Run the suite under branch coverage; return pytest's own exit code.

    `--cov-report=` asks pytest-cov for the data and no terminal report: the
    table below is the report, and printing both would invite reading the one
    number that is *not* the gate.
    """
    command = [
        sys.executable,
        "-m",
        "pytest",
        "--cov=app",
        "--cov-report=",
        *extra,
    ]
    print(f"$ {' '.join(command)}", flush=True)
    return subprocess.run(command, cwd=BACKEND_ROOT, check=False).returncode


def load_coverage() -> coverage.Coverage:
    """Read the data the collector wrote, under the collector's own configuration.

    `config_file` is left at its default so this reader picks up the same
    `[tool.coverage.run]` (`branch = true`, `source = ["app"]`) that pytest-cov
    used to *write* the numbers — a reader with its own idea of what was
    measured is a second source of truth. The data file is named outright
    because it lands beside `pyproject.toml`, not beside whatever directory the
    command happened to be typed in.
    """
    cov = coverage.Coverage(
        config_file=str(BACKEND_ROOT / "pyproject.toml"),
        data_file=str(BACKEND_ROOT / ".coverage"),
    )
    cov.load()
    return cov


# The table's columns are coverage.py's own (Stmts / Miss / Branch / BrPart),
# so a row can be checked against the full report without translating anything.
HEADER = (
    f"{'group':<10} {'files':>5} {'stmts':>6} {'miss':>5} "
    f"{'branch':>7} {'brpart':>6} {'metric':>9} {'measure':>8} {'floor':>6}  verdict"
)


def report(cov: coverage.Coverage) -> int:
    """Print the gate table; return the process exit code."""
    print()
    print(HEADER)
    print("-" * len(HEADER))
    failures: list[str] = []
    for group in GROUPS:
        numbers, matched = measure(cov, group.selectors)
        problem = judged(group, numbers, matched)
        if problem is not None:
            failures.append(f"{group.key}: {problem}")
        print(
            f"{group.key:<10} {len(matched):>5} {numbers.statements:>6} {numbers.missing:>5} "
            f"{numbers.branches:>7} {numbers.partial_branches:>6} {group.metric:>9} "
            f"{measured_value(group, numbers):>7.2f}% {group.floor:>5g}%  "
            f"{'ok' if problem is None else 'BELOW'}"
        )
    print()
    for group in GROUPS:
        print(f"  {group.key}: {group.description}")
    print()
    if failures:
        print("coverage gate FAILED:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        print(
            "\nFix it with tests, or raise the floor. Never lower one to turn this green.",
            file=sys.stderr,
        )
        return 1
    print("every group meets its floor.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.coverage_gate",
        description="Run the backend suite under branch coverage and enforce the F056 floors.",
    )
    parser.add_argument(
        "--no-run",
        action="store_true",
        help="judge the existing .coverage data instead of running the suite again",
    )
    args, extra = parser.parse_known_args(argv)
    suite_code = 0
    if args.no_run:
        if extra:
            print(f"ignoring pytest arguments with --no-run: {' '.join(extra)}", file=sys.stderr)
    else:
        suite_code = run_pytest(extra)
        if suite_code != 0:
            # The gate is the suite *and* its numbers: a red suite is a red
            # gate whatever the percentages say. The table is still worth
            # printing — a failure and the coverage it left behind are read
            # together — and the exit code stays pytest's, because a named
            # failing test is more use than a missing point.
            print(
                f"\npytest exited {suite_code}: the numbers below come from a suite "
                "that did not pass.",
                file=sys.stderr,
            )
    try:
        cov = load_coverage()
    except coverage.CoverageException as error:
        # A data file that exists but cannot be read. A *missing* one does not
        # raise — it loads as nothing measured, which the emptiness check
        # below catches by hand, because "matched no measured module" is a
        # baffling thing to read when the truth is "you never ran the suite".
        print(f"unreadable coverage data: {error}", file=sys.stderr)
        return 1
    if not cov.get_data().measured_files():
        print(
            f"no coverage data in {BACKEND_ROOT / '.coverage'}: run without "
            "--no-run, or run the suite under --cov=app first.",
            file=sys.stderr,
        )
        return 1
    verdict = report(cov)
    return suite_code or verdict


if __name__ == "__main__":
    raise SystemExit(main())
