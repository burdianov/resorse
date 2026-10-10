"""The projects table (D007) — the dates, the status, and the partial index.

The task's acceptance is **date/status constraints**, so this file is about the
constraints and nothing else: what the database refuses whatever wrote the row,
and the one rule that is unusual enough to be worth proving from both sides.

- **The dates.** A completion before the start is a typo, not a revised plan,
  and the database refuses it on either completion column. The two completions
  are *not* ordered against each other — C09 makes the forecast independently
  editable against a contractual date that does not move — and a pure test
  pins that no such constraint was invented.
- **The status.** A closed vocabulary of three, refused by CHECK rather than by
  the service, so a `psql` session is held to the same three values.
- **The partial unique index.** This is the table's load-bearing rule
  (DOMAIN_ARCHITECTURE §3, C57): a code is unique **among live projects**.
  Awarding a tender creates a second row that reuses the retired tender's code,
  so the index permits exactly that pair and refuses two live rows sharing one.
  Both directions are proved here, because the permissive half is the half a
  full unique index would break.
- **The one reference.** `responsible_user_id` is nullable and `RESTRICT`, and
  both are asserted in the pure tests: nullability is the decision (a tender
  exists before anyone answers for it), and the ondelete is the other.

Two things are deliberately absent and pinned as such: **no rows ship** (no
specification names an initial project, so `app/seed.py` must not invent one)
and **no `Date` column that is really an instant** — these are the tree's first
calendar-day columns.

The pure tests at the top need no database and deliberately carry no
`integration` marker; `tests/test_markers.py` fails in both directions.
"""

import uuid
from datetime import date, timedelta
from typing import cast

import pytest
from sqlalchemy import CheckConstraint, Date, Index, Table, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PROJECT_STATUSES, Project, User
from app.models.projects import MAX_CODE_LENGTH, MAX_NAME_LENGTH, MAX_STATUS_LENGTH
from app.seed import seed

# --- pure: the shape the map describes, before any database sees it -----------


def test_the_status_vocabulary_is_the_three_the_specification_names() -> None:
    """`PRODUCT_SPEC` §4 names the tender/awarded lifecycle and C57 adds the
    retired state the award leaves behind. Pinned literally so a fourth value
    is a decision rather than an edit."""
    assert PROJECT_STATUSES == ("tender", "awarded", "retired")


def test_the_dates_are_calendar_days_not_instants() -> None:
    """The tree's first `Date` columns. F023's convention is `timestamptz` for
    *events*; a project's start and completions are days a contract names and
    the month arithmetic consumes (C55), so an instant would invent a time zone
    nobody has."""
    columns = cast(Table, Project.__table__).columns
    for name in ("start_date", "contractual_completion", "forecast_completion"):
        assert isinstance(columns[name].type, Date), f"{name} is not a calendar day"
        assert not columns[name].nullable


def test_the_two_completions_are_not_ordered_against_each_other() -> None:
    """C09: contractual and forecast completion are separate and the forecast
    is independently editable, so the constraints are exactly the five this
    task chose — and none of them compares the two completion columns to each
    other."""
    checks = {
        str(constraint.name): str(constraint.sqltext)
        for constraint in cast(Table, Project.__table__).constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert set(checks) == {
        "ck_projects_code_is_present",
        "ck_projects_name_is_present",
        "ck_projects_status_is_known",
        "ck_projects_contractual_completion_is_not_before_start",
        "ck_projects_forecast_completion_is_not_before_start",
    }
    between_the_completions = (
        "contractual_completion" in checks["ck_projects_forecast_completion_is_not_before_start"]
    )
    assert not between_the_completions


def test_the_code_uniqueness_is_partial_and_retirement_is_what_excludes_a_row() -> None:
    """The rule, not an optimisation: the index's predicate is what lets an
    awarded project reuse its retired tender's code (C57)."""
    index = _code_index()
    assert index.unique
    assert "retired" in str(index.dialect_options["postgresql"]["where"])


def test_the_responsibility_reference_is_nullable_and_restrictive() -> None:
    """Nullable because a tender exists before anyone answers for it (D019);
    `RESTRICT` because the column is what `own-project` scope resolves against,
    and silently blanking it would erase a fact rather than record one."""
    references = [
        (fk.parent.name, fk.target_fullname, fk.ondelete, fk.parent.nullable)
        for fk in cast(Table, Project.__table__).foreign_keys
    ]
    assert references == [("responsible_user_id", "users.id", "RESTRICT", True)]


def test_the_table_reuses_the_reference_widths_for_its_business_code() -> None:
    """DOMAIN_ARCHITECTURE §3 groups `projects.code` with the reference tables'
    business codes under one uniqueness rule, so the widths match — but no
    slug CHECK is borrowed: a project code is business data and the
    specification gives it no shape."""
    assert (MAX_CODE_LENGTH, MAX_NAME_LENGTH, MAX_STATUS_LENGTH) == (32, 200, 16)
    checks = " ".join(
        str(constraint.sqltext)
        for constraint in cast(Table, Project.__table__).constraints
        if isinstance(constraint, CheckConstraint)
    )
    assert "~" not in checks, "no slug pattern was borrowed from the reference tables"


def _code_index() -> Index:
    indexes = {str(index.name): index for index in cast(Table, Project.__table__).indexes}
    assert set(indexes) == {"ix_projects_code", "ix_projects_responsible_user_id"}
    return indexes["ix_projects_code"]


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


async def _a_user(session: AsyncSession) -> User:
    user = User(
        email="responsible@example.com",
        full_name="Responsible Person",
        hashed_password="not-a-real-hash",
        roles=[],
    )
    session.add(user)
    await session.flush()
    return user


# --- the status vocabulary ----------------------------------------------------


@pytest.mark.parametrize("status", ["proposed", "TENDER", "Awarded", ""])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_status_outside_the_vocabulary_is_refused(
    session: AsyncSession, status: str
) -> None:
    session.add(a_project(status=status))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_projects_status_is_known" in str(caught.value.orig)


@pytest.mark.parametrize("status", list(PROJECT_STATUSES))
@pytest.mark.integration
@pytest.mark.asyncio
async def test_every_value_in_the_vocabulary_lands(session: AsyncSession, status: str) -> None:
    session.add(a_project(code=f"dc-{status}", status=status))
    await session.flush()

    assert await session.scalar(select(func.count()).select_from(Project)) == 1


# --- the dates ----------------------------------------------------------------


@pytest.mark.parametrize("column", ["contractual_completion", "forecast_completion"])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_completion_before_the_start_is_refused(session: AsyncSession, column: str) -> None:
    """Either completion, because both are checked. A project that finishes
    before it starts is not a plan anyone can act on."""
    constraint = f"ck_projects_{column}_is_not_before_start"
    session.add(a_project(**{column: START - timedelta(days=1)}))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert constraint in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_completion_on_the_start_day_is_allowed(session: AsyncSession) -> None:
    """Inclusive, and that boundary is the whole constraint: a one-day project
    is odd but not a typo."""
    session.add(
        a_project(start_date=START, contractual_completion=START, forecast_completion=START)
    )
    await session.flush()

    assert await session.scalar(select(func.count()).select_from(Project)) == 1


# --- the partial unique index: both directions --------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_two_live_projects_cannot_share_a_code(session: AsyncSession) -> None:
    session.add(a_project(code="dc-01"))
    await session.flush()
    session.add(a_project(code="dc-01", name="A second tender"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    # The naming convention (F023) is what makes the error name the index.
    assert "ix_projects_code" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_an_awarded_project_may_reuse_its_retired_tenders_code(
    session: AsyncSession,
) -> None:
    """C57's award, as the index sees it: the tender row is retired and the
    awarded project takes its code. A full unique index would refuse exactly
    this, which is why the index is partial."""
    tender = a_project(code="dc-01", status="retired")
    awarded = a_project(code="dc-01", name="Data Centre 1 (awarded)", status="awarded")
    session.add_all([tender, awarded])
    await session.flush()

    codes = (await session.scalars(select(Project.code))).all()
    assert codes == ["dc-01", "dc-01"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_retiring_a_row_frees_its_code_for_a_new_live_row(
    session: AsyncSession,
) -> None:
    """The same rule from the other side: the exclusion is the *retired* state,
    not a one-off concession to the award path."""
    session.add(a_project(code="dc-01"))
    await session.flush()
    live = (await session.scalars(select(Project))).one()
    live.status = "retired"
    await session.flush()

    session.add(a_project(code="dc-01", name="A fresh start"))
    await session.flush()

    assert await session.scalar(select(func.count()).select_from(Project)) == 2


# --- presence, and the one reference ------------------------------------------


@pytest.mark.parametrize("code", ["", "   "])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_blank_code_is_refused(session: AsyncSession, code: str) -> None:
    session.add(a_project(code=code))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_projects_code_is_present" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_blank_name_is_refused(session: AsyncSession) -> None:
    session.add(a_project(name="   "))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_projects_name_is_present" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_project_may_have_no_responsible_person_yet(session: AsyncSession) -> None:
    """A tender exists before it is anyone's (D019), so the column is nullable
    and the row that ships is a project with no answerable person."""
    session.add(a_project())
    await session.flush()

    row = (await session.scalars(select(Project))).one()
    assert row.responsible_user_id is None
    assert row.id.version == 7
    assert row.created_at.utcoffset() == timedelta(0)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_responsible_person_that_does_not_exist_is_refused(
    session: AsyncSession,
) -> None:
    session.add(a_project(responsible_user_id=uuid.uuid4()))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_projects_responsible_user_id_users" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_responsible_person_cannot_be_hard_deleted(session: AsyncSession) -> None:
    """`ON DELETE RESTRICT` from the wrong side: the product soft-deletes users
    (C22), so this only fires on deliberate surgery — and then the database
    refuses to blank the answerable person rather than doing it silently."""
    user = await _a_user(session)
    session.add(a_project(responsible_user_id=user.id))
    await session.flush()

    await session.delete(user)

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_projects_responsible_user_id_users" in str(caught.value.orig)


# --- no rows ship -------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_seeding_a_migrated_database_invents_no_projects(session: AsyncSession) -> None:
    """D007 ships no initial values, so the seed's job here is to do nothing to
    this table — the seven disciplines prove the seed creates reference rows;
    this proves it creates only the ones a specification names."""
    report = await seed(session)

    assert report.disciplines_created == 7
    assert await session.scalar(select(func.count()).select_from(Project)) == 0
