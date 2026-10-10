"""The second reference table (D003) — the constraints, and nothing else.

The task's acceptance is **constraints tests**: what the database itself
refuses, whatever writes. A department is a lowercase-slug code, a present
name and one of the specification's two classifications, so this file asserts
each of those from the wrong side — the duplicate code, the malformed code,
the blank name, the classification that is neither `HEAD_OFFICE` nor `SITE`
(and the missing one) — and then from the right side: both classifications
accepted, `is_active` defaulting to offered, the F023 conventions (a UUID v7
primary key, timezone-aware instants) reaching the row.

Two things are deliberately absent and pinned as such:

- **No seed rows.** Unlike the seven disciplines, the specification names no
  initial departments (`PRODUCT_SPEC` §3 describes the columns and stops), so
  `app/seed.py` must not invent any. The last test seeds a migrated database
  and asserts the table is still empty — if a later task gives this table
  initial values, that is a decision and this test is where it shows up.
- **No vocabulary of its own.** `classification` is a closed two-value set;
  the pure test at the top spells both values out literally so adding a third
  fails a test and gets a decision rather than riding along in a tuple.

The plain function at the top needs no database and deliberately carries no
`integration` marker; `tests/test_markers.py` fails in both directions.
"""

import re
from datetime import timedelta
from typing import cast

import pytest
from sqlalchemy import CheckConstraint, Table, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department
from app.models.masters import (
    CODE_PATTERN,
    DEPARTMENT_CLASSIFICATIONS,
    MAX_CLASSIFICATION_LENGTH,
    MAX_CODE_LENGTH,
    MAX_NAME_LENGTH,
)
from app.seed import seed

# PRODUCT_SPEC §3 and DOMAIN_ARCHITECTURE §2 name the same two, spelled out
# literally here for the reason the docstring gives.
EXPECTED_CLASSIFICATIONS = ("HEAD_OFFICE", "SITE")


# --- pure: the closed vocabulary and its shape --------------------------------


def test_the_classifications_are_the_two_the_specification_names() -> None:
    assert DEPARTMENT_CLASSIFICATIONS == EXPECTED_CLASSIFICATIONS


def test_every_classification_fits_the_column_and_is_a_plain_token() -> None:
    for classification in DEPARTMENT_CLASSIFICATIONS:
        assert len(classification) <= MAX_CLASSIFICATION_LENGTH, classification
        assert re.fullmatch(r"[A-Z][A-Z_]*", classification), classification


def test_the_code_pattern_is_the_shared_lowercase_slug() -> None:
    # The same vocabulary `disciplines` uses, spelled out so that changing it
    # is a decision rather than a refactor: a letter, then letters, digits and
    # underscores. The database enforces it; this pins what "it" means.
    assert re.fullmatch(CODE_PATTERN, "head_office")
    assert re.fullmatch(CODE_PATTERN, "site_a2")
    assert not re.fullmatch(CODE_PATTERN, "Head_Office")
    assert not re.fullmatch(CODE_PATTERN, "head-office")


def test_the_database_check_is_generated_from_that_vocabulary() -> None:
    """One source of truth: the CHECK is written from `DEPARTMENT_CLASSIFICATIONS`.

    A hand-typed `classification IN ('HEAD_OFFICE', 'SITE')` would pass every
    other test in this file and then silently disagree with the tuple the API
    layer reads — the drift this asserts cannot happen. The `disciplines`
    columns are the same widths and pattern, so the two reference tables
    cannot diverge on shape either.
    """
    assert (MAX_CODE_LENGTH, MAX_NAME_LENGTH) == (32, 200)

    checks = [
        str(constraint.sqltext)
        for constraint in cast(Table, Department.__table__).constraints
        if isinstance(constraint, CheckConstraint)
    ]
    known = next(text for text in checks if "classification IN" in text)
    assert all(f"'{classification}'" in known for classification in DEPARTMENT_CLASSIFICATIONS)


# --- what the database enforces on the table ----------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_code_cannot_be_duplicated(session: AsyncSession) -> None:
    session.add(Department(code="head_office", name="Head Office", classification="HEAD_OFFICE"))
    await session.flush()
    session.add(Department(code="head_office", name="The other one", classification="SITE"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    # The naming convention (F023) is what makes the error name the index.
    assert "ix_departments_code" in str(caught.value.orig)


@pytest.mark.parametrize(
    ("label", "code"),
    [
        ("a capital letter", "Head_Office"),
        ("a separator", "head-office"),
        ("leading space", " head_office"),
        ("digits first", "3site"),
        ("empty", ""),
    ],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_malformed_code_is_refused_by_the_database(
    session: AsyncSession, label: str, code: str
) -> None:
    session.add(Department(code=code, name="Well named", classification="SITE"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_departments_code_is_well_formed" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_blank_name_is_refused_by_the_database(session: AsyncSession) -> None:
    session.add(Department(code="unused", name="   ", classification="SITE"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_departments_name_is_present" in str(caught.value.orig)


@pytest.mark.parametrize(
    ("label", "classification"),
    [
        ("a third value", "REMOTE"),
        ("lowercase", "head_office"),
        ("a space instead of the underscore", "HEAD OFFICE"),
        ("trailing space", "SITE "),
        ("empty", ""),
    ],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_an_unknown_classification_is_refused_by_the_database(
    session: AsyncSession, label: str, classification: str
) -> None:
    session.add(Department(code="head_office", name="Head Office", classification=classification))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_departments_classification_is_known" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_missing_classification_is_refused_by_the_database(
    session: AsyncSession,
) -> None:
    """The classification is required, not defaulted: a department that is
    neither the head office nor a site is not a state this table represents."""
    session.add(Department(code="head_office", name="Head Office", classification=None))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "classification" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_both_classifications_are_accepted_and_the_row_defaults_hold(
    session: AsyncSession,
) -> None:
    session.add(Department(code="head_office", name="Head Office", classification="HEAD_OFFICE"))
    session.add(Department(code="site_a", name="Site A", classification="SITE"))
    await session.flush()

    rows = {row.code: row for row in (await session.scalars(select(Department))).all()}
    assert rows["head_office"].classification == "HEAD_OFFICE"
    assert rows["site_a"].classification == "SITE"
    assert all(row.is_active for row in rows.values()), "a new row ships offered"
    # The F023 conventions reach this table too.
    assert all(row.id.version == 7 for row in rows.values())
    assert all(row.created_at.utcoffset() == timedelta(0) for row in rows.values())


# --- no rows ship -------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_seeding_a_migrated_database_invents_no_departments(
    session: AsyncSession,
) -> None:
    """`D003` ships no initial values, so the seed's job here is to do nothing.

    The seven disciplines prove the seed *can* create reference rows; this
    proves it creates only the ones the specification names. The assertion is
    on the row count after a seed run, not on the report, because that is the
    claim an operator can see in the database.
    """
    report = await seed(session)

    assert report.disciplines_created == 7
    assert await session.scalar(select(func.count()).select_from(Department)) == 0
