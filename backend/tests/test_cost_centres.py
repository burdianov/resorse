"""The cost centres table (D010) — the Head Office row, and a project's.

The task's acceptance is **Project/Head Office distinct tests**, so this file is
about the distinction the table exists to hold, from both sides:

- **Exactly one Head Office row.** The map's rule ("exactly one `HEAD_OFFICE`
  row") is a unique index over the kind column restricted to that one kind,
  because a CHECK cannot count rows. Both directions are proved: a second Head
  Office row is refused *and* the first one is not — a predicate that excluded
  the kind altogether would pass the first test and fail the second.
- **One row per project, and the two kinds coexist.** A project's cost centre
  names its project; two projects carry two rows; and neither uniqueness covers
  the other kind. That is what makes these two *kinds* rather than one table
  with an optional reference, and it is why both indexes are partial.
- **The kind and the reference are one fact.** `(PROJECT, NULL)` and
  `(HEAD_OFFICE, <a project>)` are both refused by CHECK: a project cost centre
  belonging to no project is not a row this table represents, and a Head Office
  row naming a project would be a second cost centre for it under a kind whose
  uniqueness does not cover it.

Three things are deliberately absent and pinned as such: **no `code`** (a cost
centre is identified by its project, or by being the single row of its kind),
**no currency and no legal entity** (the map's sentence: "no invented legal
entities or currencies"), and **no active flag** (a project's cost centre
retires with its project's status; the Head Office row is never retired).

The migration ships no rows — the **Head Office row is the seed's**, and the
last two tests are the ones that prove it, including that a re-run leaves an
operator's row alone.

The pure tests at the top need no database and deliberately carry no
`integration` marker; `tests/test_markers.py` fails in both directions.
"""

import uuid
from datetime import date, timedelta
from typing import cast

import pytest
from sqlalchemy import CheckConstraint, Index, String, Table, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import COST_CENTRE_KINDS, CostCentre, Project
from app.models.projects import (
    HEAD_OFFICE_KIND,
    MAX_KIND_LENGTH,
    MAX_NAME_LENGTH,
    PROJECT_KIND,
)
from app.seed import HEAD_OFFICE_COST_CENTRE_NAME, seed

# --- pure: the shape the map describes, before any database sees it -----------


def test_the_kind_vocabulary_is_the_pair_the_map_names() -> None:
    """§2 draws the row as `kind HEAD_OFFICE|PROJECT`. Pinned literally so a
    third kind is a decision rather than an edit — and so the two single-kind
    indexes below are known to be the whole vocabulary, not a sample of it."""
    assert COST_CENTRE_KINDS == ("HEAD_OFFICE", "PROJECT")
    assert (HEAD_OFFICE_KIND, PROJECT_KIND) == COST_CENTRE_KINDS


def test_the_exactly_one_head_office_rule_is_a_partial_unique_index() -> None:
    """A CHECK cannot count rows, so "exactly one HEAD_OFFICE row" can only be a
    uniqueness over the kind column restricted to that kind. The predicate is
    the rule, the same way `WHERE status <> 'retired'` is for a project code
    (D007)."""
    index = _indexes()["ix_cost_centres_kind"]
    assert index.unique
    assert str(index.dialect_options["postgresql"]["where"]) == f"kind = '{HEAD_OFFICE_KIND}'"


def test_one_cost_centre_per_project_is_a_partial_unique_index_too() -> None:
    """Partial for the same reason: the predicate says which rows the rule is
    about, rather than relying on Postgres treating `NULL`s as distinct."""
    index = _indexes()["ix_cost_centres_project_id"]
    assert index.unique
    assert str(index.dialect_options["postgresql"]["where"]) == f"kind = '{PROJECT_KIND}'"


def test_the_kind_and_the_reference_are_one_constraint() -> None:
    """Three CHECKs and no more: presence, the closed vocabulary, and the pair.
    The third is what makes `(PROJECT, NULL)` unwritable, and it admits exactly
    one branch per kind — no third branch that a row matching neither could
    slip through."""
    checks = _checks()
    assert set(checks) == {
        "ck_cost_centres_name_is_present",
        "ck_cost_centres_kind_is_known",
        "ck_cost_centres_project_reference_matches_kind",
    }
    reference = checks["ck_cost_centres_project_reference_matches_kind"]
    assert f"kind = '{HEAD_OFFICE_KIND}'" in reference
    assert f"kind = '{PROJECT_KIND}'" in reference
    assert reference.count("project_id IS NULL") == 1
    assert reference.count("project_id IS NOT NULL") == 1


def test_the_reference_to_a_project_is_nullable_and_restrictive() -> None:
    """Nullable because the Head Office row names no project; `RESTRICT` because
    a project with a cost centre cannot be deleted out from under the
    assignments that will point at it (DOMAIN_ARCHITECTURE §2's write
    boundary)."""
    references = [
        (fk.parent.name, fk.target_fullname, fk.ondelete, fk.parent.nullable)
        for fk in cast(Table, CostCentre.__table__).foreign_keys
    ]
    assert references == [("project_id", "projects.id", "RESTRICT", True)]


def test_the_table_is_the_three_columns_the_map_gives_it() -> None:
    """No `code`, no currency, no legal entity. A code would be a second
    identity for a row that already has one — its project, or being the single
    row of its kind — and the other two are what the map's own sentence rules
    out by name ("no invented legal entities or currencies")."""
    columns = set(cast(Table, CostCentre.__table__).columns.keys())
    assert columns == {"id", "created_at", "updated_at", "kind", "name", "project_id"}


def test_the_widths_are_the_ones_the_rest_of_the_tree_uses() -> None:
    """The kind reuses the closed-vocabulary width `projects.status` uses, and
    the name the label width every table here gives a name."""
    assert (MAX_KIND_LENGTH, MAX_NAME_LENGTH) == (16, 200)
    columns = cast(Table, CostCentre.__table__).columns
    assert cast(String, columns["kind"].type).length == MAX_KIND_LENGTH
    assert cast(String, columns["name"].type).length == MAX_NAME_LENGTH


def _indexes() -> dict[str, Index]:
    indexes = {str(index.name): index for index in cast(Table, CostCentre.__table__).indexes}
    assert set(indexes) == {"ix_cost_centres_kind", "ix_cost_centres_project_id"}
    return indexes


def _checks() -> dict[str, str]:
    return {
        str(constraint.name): str(constraint.sqltext)
        for constraint in cast(Table, CostCentre.__table__).constraints
        if isinstance(constraint, CheckConstraint)
    }


# --- shared fixtures, built by hand so no seed row is implied -----------------

START = date(2026, 1, 1)


def a_project(**overrides: object) -> Project:
    """A live project, well-formed unless a test says otherwise."""
    values: dict[str, object] = {
        "code": "dc-01",
        "name": "Data Centre 1",
        "status": "tender",
        "start_date": START,
        "contractual_completion": START + timedelta(days=365),
        "forecast_completion": START + timedelta(days=395),
    }
    values.update(overrides)
    return Project(**values)


def a_cost_centre(**overrides: object) -> CostCentre:
    """The Head Office row, unless a test says otherwise."""
    values: dict[str, object] = {"kind": HEAD_OFFICE_KIND, "name": "Head Office"}
    values.update(overrides)
    return CostCentre(**values)


async def _a_project_row(session: AsyncSession, code: str = "dc-01") -> Project:
    project = a_project(code=code)
    session.add(project)
    await session.flush()
    return project


async def _a_project_cost_centre(session: AsyncSession, project: Project) -> CostCentre:
    cost_centre = a_cost_centre(kind=PROJECT_KIND, name=project.name, project_id=project.id)
    session.add(cost_centre)
    await session.flush()
    return cost_centre


# --- the Head Office rule: both directions ------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_second_head_office_cost_centre_is_refused(session: AsyncSession) -> None:
    """Two Head Office rows would be two answers to a question the product says
    has one answer, so the database refuses the second."""
    session.add(a_cost_centre())
    await session.flush()
    session.add(a_cost_centre(name="Head Office, second attempt"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ix_cost_centres_kind" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_one_head_office_row_lands(session: AsyncSession) -> None:
    """The permissive half, proved separately: the index refuses a *second* row
    and permits the first. A predicate that constrained nothing — or excluded
    the kind it names — would be a rule that holds by refusing everything."""
    session.add(a_cost_centre())
    await session.flush()

    row = (await session.scalars(select(CostCentre))).one()
    assert (row.kind, row.name, row.project_id) == (HEAD_OFFICE_KIND, "Head Office", None)
    assert row.id.version == 7
    assert row.created_at.utcoffset() == timedelta(0)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_head_office_row_and_a_projects_row_coexist(session: AsyncSession) -> None:
    """The distinctness the acceptance names: the uniqueness over `kind`
    constrains only the Head Office kind and the uniqueness over `project_id`
    only the project kind, so the one row the product names and the row a
    project carries are storable side by side. A single full index on either
    column could not allow both."""
    project = await _a_project_row(session)
    session.add_all(
        [
            a_cost_centre(),
            a_cost_centre(kind=PROJECT_KIND, name=project.name, project_id=project.id),
        ]
    )
    await session.flush()

    kinds = (await session.scalars(select(CostCentre.kind).order_by(CostCentre.kind))).all()
    assert kinds == ["HEAD_OFFICE", "PROJECT"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_two_projects_may_each_have_their_own_cost_centre(session: AsyncSession) -> None:
    """The project half is about *one per project*, not one in total: the
    partial predicate is what keeps the second project's row storable while a
    project's duplicate is refused (below)."""
    first = await _a_project_row(session, code="dc-01")
    second = await _a_project_row(session, code="dc-02")
    session.add_all(
        [
            a_cost_centre(kind=PROJECT_KIND, name=first.name, project_id=first.id),
            a_cost_centre(kind=PROJECT_KIND, name=second.name, project_id=second.id),
        ]
    )
    await session.flush()

    assert await session.scalar(select(func.count()).select_from(CostCentre)) == 2


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_second_cost_centre_for_one_project_is_refused(session: AsyncSession) -> None:
    project = await _a_project_row(session)
    await _a_project_cost_centre(session, project)
    session.add(a_cost_centre(kind=PROJECT_KIND, name=project.name, project_id=project.id))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ix_cost_centres_project_id" in str(caught.value.orig)


# --- the kind, and the pair it makes with the reference -----------------------


@pytest.mark.parametrize("kind", ["PROJECTS", "head_office", "OTHER", ""])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_kind_outside_the_vocabulary_is_refused(session: AsyncSession, kind: str) -> None:
    session.add(a_cost_centre(kind=kind))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_cost_centres_kind_is_known" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_project_cost_centre_must_name_a_project(session: AsyncSession) -> None:
    """`(PROJECT, NULL)` is the row the pair-check exists to refuse: a project's
    cost centre has no project to be unique per."""
    session.add(a_cost_centre(kind=PROJECT_KIND, name="Data Centre 1"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_cost_centres_project_reference_matches_kind" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_head_office_cost_centre_must_not_name_a_project(session: AsyncSession) -> None:
    """The other direction, and not symmetry for its own sake: a Head Office row
    naming a project is a second cost centre for that project under a kind whose
    uniqueness does not cover it."""
    project = await _a_project_row(session)
    session.add(a_cost_centre(project_id=project.id))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_cost_centres_project_reference_matches_kind" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_blank_name_is_refused(session: AsyncSession) -> None:
    session.add(a_cost_centre(name="   "))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_cost_centres_name_is_present" in str(caught.value.orig)


# --- the reference, from both sides -------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_project_cost_centre_pointing_at_no_project_row_is_refused(
    session: AsyncSession,
) -> None:
    session.add(a_cost_centre(kind=PROJECT_KIND, name="Data Centre 1", project_id=uuid.uuid4()))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_cost_centres_project_id_projects" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_project_with_a_cost_centre_cannot_be_hard_deleted(session: AsyncSession) -> None:
    """`RESTRICT` from the wrong side. This is the first reference to `projects`,
    so it is what will make D008's "a project with rows behind it cannot be
    deleted" arm reachable — and while nothing in the API creates a project's
    cost centre, that arm stays unreachable through the service, which is why
    D008's record of it is still accurate rather than stale."""
    project = await _a_project_row(session)
    await _a_project_cost_centre(session, project)

    await session.delete(project)

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_cost_centres_project_id_projects" in str(caught.value.orig)


# --- the seed owns the Head Office row ----------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_seeding_a_migrated_database_creates_the_one_head_office_row(
    session: AsyncSession,
) -> None:
    """The migration ships no rows (`0016`), so the Head Office cost centre is
    the seed's — the split the disciplines already follow. One row, of the one
    kind the product names, and no project cost centre invented for a database
    with no projects in it."""
    report = await seed(session)

    assert report.cost_centres_created == 1
    assert await session.scalar(select(func.count()).select_from(CostCentre)) == 1
    row = (await session.scalars(select(CostCentre))).one()
    assert (row.kind, row.name, row.project_id) == (
        HEAD_OFFICE_KIND,
        HEAD_OFFICE_COST_CENTRE_NAME,
        None,
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_seeding_again_leaves_the_head_office_row_alone(session: AsyncSession) -> None:
    """Create-if-missing by kind, and never an update: an operator who renamed
    theirs keeps that name through every re-run — which is also why the lookup
    is by kind and not by name."""
    await seed(session)
    row = (await session.scalars(select(CostCentre))).one()
    row.name = "Head Office (Leeds)"
    await session.flush()

    second = await seed(session)

    assert second.is_noop
    assert (await session.scalars(select(CostCentre.name))).all() == ["Head Office (Leeds)"]
