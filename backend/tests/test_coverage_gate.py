"""The coverage gate's checking logic, without running the suite (F056).

`scripts/coverage_gate.py` does two things: it runs pytest under coverage, and
it decides whether the numbers satisfy the floors. Only the second is worth a
test — the first is the suite testing itself — so nothing here collects
coverage or touches a database.

Two properties matter beyond plain arithmetic, and both are checked here
because both fail *open* (the gate goes green):

- a **floor is a floor**: at it passes, under it fails, and it is compared
  against the metric the group declares, not against whichever number happens
  to be higher;
- a group that **matched nothing** must fail. `_percent` answers a vacuous 100
  to 0/0, so a selector typo would leave the strictest row of the gate
  permanently green — the one failure mode a coverage gate cannot be allowed
  to have.
"""

from pathlib import Path

import pytest

from scripts.coverage_gate import (
    AUTH_RBAC_MODULES,
    BACKEND_ROOT,
    GROUPS,
    Group,
    Metric,
    Numbers,
    judged,
)

# A group whose floor sits between two easy-to-construct numbers, so the
# boundary is what is being tested rather than the arithmetic that produced it.
PERFECT = Numbers(statements=100, missing=0, branches=100, missing_branches=0)
# 50/100 statements and 50/100 branches: (50 + 50) / (100 + 100) = 50.00%.
HALF = Numbers(statements=100, missing=50, branches=100, missing_branches=50)
# Statements perfect, every branch arc missed: (100 + 0) / (100 + 100) = 50.00%
# on the combined metric, 0.00% on branches.
NO_BRANCHES = Numbers(statements=100, missing=0, branches=100, missing_branches=100)


def group(floor: float = 85, metric: Metric = "cover") -> Group:
    return Group(
        key="sample",
        description="a group built for one test, not one of the gate's own",
        selectors=("app/core/",),
        floor=floor,
        metric=metric,
    )


# --- the arithmetic -----------------------------------------------------------


def test_the_combined_percentage_is_the_reports_cover_column() -> None:
    # Coverage's Cover column counts statements *and* branches in one fraction:
    # 4 statements with 1 missing and 2 branches with 1 missing is
    # (3 + 1) / (4 + 2) = 66.67, not the 75% statement coverage alone.
    numbers = Numbers(statements=4, missing=1, branches=2, missing_branches=1)
    assert numbers.percent_covered == pytest.approx(66.666666, abs=1e-5)
    assert numbers.percent_branches == pytest.approx(50.0)


def test_a_file_with_no_statements_scores_nothing_rather_than_dividing_by_zero() -> None:
    empty = Numbers()
    assert empty.percent_covered == 100.0
    assert empty.percent_branches == 100.0


# --- the floor ----------------------------------------------------------------


def test_a_group_exactly_at_its_floor_passes() -> None:
    assert judged(group(floor=50), HALF, ["app/core/example.py"]) is None


def test_a_group_under_its_floor_fails_and_says_by_how_much() -> None:
    message = judged(group(floor=85), HALF, ["app/core/example.py"])
    assert message is not None
    assert "50.00%" in message and "85%" in message and "35.00 point" in message


def test_a_branch_floor_judges_branches_not_the_combined_number() -> None:
    # The point of the `branches` metric: this group is at 50% combined, which
    # clears a floor of 40 — but its branches are 0%, and that is what the
    # group declares it is measuring.
    strict = group(floor=40, metric="branches")
    assert judged(strict, NO_BRANCHES, ["app/services/auth.py"]) is not None
    lenient = group(floor=40, metric="cover")
    assert judged(lenient, NO_BRANCHES, ["app/services/auth.py"]) is None


def test_a_group_that_matched_nothing_fails_however_good_its_numbers_look() -> None:
    message = judged(group(floor=85), PERFECT, [])
    assert message is not None
    assert "matched no measured module" in message


def test_a_group_that_matched_only_empty_modules_fails_too() -> None:
    # An `__init__.py` of comments: it matched, so the "matched nothing" guard
    # does not fire, and it has no statements to judge.
    message = judged(group(), Numbers(), ["app/core/__init__.py"])
    assert message is not None
    assert "no statements" in message


# --- the configuration, which is what the floors are ---------------------------


def test_no_floor_sits_below_the_requirements_85() -> None:
    # BP-10.5's own number. The ratchets sit above it; a floor edited below it
    # is a requirement being dropped, not a flaky check being softened.
    for configured in GROUPS:
        assert configured.floor >= 85, configured.key


def test_the_groups_are_distinctly_named_and_carry_a_reason() -> None:
    keys = [configured.key for configured in GROUPS]
    assert len(keys) == len(set(keys))
    for configured in GROUPS:
        assert configured.selectors, configured.key
        assert len(configured.description) > 20, configured.key


def test_every_selector_is_a_backend_relative_path() -> None:
    # `measure` matches `startswith` on paths relative to `backend/`, so a
    # selector written as an absolute path — or without the `app/` prefix —
    # would match nothing and fail as a vacuous 100.
    for configured in GROUPS:
        for selector in configured.selectors:
            assert selector.startswith("app/"), selector
            assert selector.endswith(("/", ".py")), selector


def test_every_selector_names_a_module_that_exists() -> None:
    # The strongest check available without coverage data, and the one that
    # catches the silent failure: a selector that names a renamed or deleted
    # module matches nothing, and a group that matches nothing scores 100.
    for selector in AUTH_RBAC_MODULES:
        assert (BACKEND_ROOT / selector).is_file(), selector
    for configured in GROUPS:
        for selector in configured.selectors:
            assert (BACKEND_ROOT / selector).exists(), f"{configured.key}: {selector}"


def test_the_auth_modules_are_listed_once_each() -> None:
    # A duplicate would add its numbers twice and quietly raise the group's
    # percentage above the code's real one.
    assert len(AUTH_RBAC_MODULES) == len(set(AUTH_RBAC_MODULES))
    assert all(Path(module).suffix == ".py" for module in AUTH_RBAC_MODULES)
