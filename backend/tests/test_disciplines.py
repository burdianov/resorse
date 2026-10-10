"""The first reference table and its seed (D002).

The task's acceptance is the seed, so most of this file is about
**idempotency with an exact meaning** — the same doctrine `test_seed.py` pins
for roles and permissions, applied to rows the specification says must exist:

- the first run creates the seven and says so;
- a re-run creates nothing and changes nothing (the report is a no-op);
- an operator's edit — a corrected name, a deactivation — **survives** the
  re-run, because the seed creates what is missing and never updates what is
  there.

The rest pins what the database itself enforces on the new table: the unique
code (the business-code rule of DOMAIN_ARCHITECTURE §3) and the two CHECKs
that make a malformed code or a blank name impossible from any writer,
including a console session. Those tests are the F024 pattern — assert what
PostgreSQL does and that the error names the constraint.

The plain functions at the top need no database and deliberately carry no
`integration` marker; `tests/test_markers.py` fails in both directions, so a
database-backed test without the marker and a database-free test with it are
both errors.
"""

import re
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Discipline
from app.models.masters import CODE_PATTERN, MAX_CODE_LENGTH, MAX_NAME_LENGTH
from app.seed import DEFAULT_DISCIPLINES, seed

# PRODUCT_SPEC §3 names all seven, spelled out literally here: the point is
# that adding, renaming or retiring a shipped value fails a test and gets a
# decision, not that the constant equals itself.
EXPECTED_DISCIPLINES = {
    "electrical": "Electrical",
    "mechanical": "Mechanical",
    "plumbing": "Plumbing",
    "csi": "CSI",
    "mep": "MEP",
    "elv": "ELV",
    "general": "General",
}


# --- pure: the shipped set and its shape --------------------------------------


def test_the_shipped_disciplines_are_the_specification() -> None:
    assert dict(DEFAULT_DISCIPLINES) == EXPECTED_DISCIPLINES


def test_every_shipped_code_is_a_slug_and_every_name_fits_the_column() -> None:
    codes = [code for code, _ in DEFAULT_DISCIPLINES]
    assert len(codes) == len(set(codes)), "two shipped rows would collide on the unique code"

    for code, name in DEFAULT_DISCIPLINES:
        assert re.fullmatch(CODE_PATTERN, code), code
        assert len(code) <= MAX_CODE_LENGTH, code
        assert name.strip(), code
        assert len(name) <= MAX_NAME_LENGTH, code


# --- the first run, and what a re-run must not do -----------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_first_seed_creates_the_seven_disciplines(session: AsyncSession) -> None:
    report = await seed(session)

    assert report.disciplines_created == 7
    assert not report.is_noop

    rows = (await session.scalars(select(Discipline))).all()
    assert {row.code: row.name for row in rows} == EXPECTED_DISCIPLINES
    assert all(row.is_active for row in rows), "a seeded value ships offered"
    # The F023 conventions reach this table too: a database-generated UUID v7
    # and timezone-aware instants.
    assert all(row.id.version == 7 for row in rows)
    assert all(row.created_at.utcoffset() == timedelta(0) for row in rows)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_rerun_creates_nothing_and_the_report_says_so(session: AsyncSession) -> None:
    await seed(session)

    second = await seed(session)

    assert second.disciplines_created == 0
    assert second.is_noop
    assert await session.scalar(select(func.count()).select_from(Discipline)) == 7


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_renamed_and_deactivated_discipline_survives_a_rerun(
    session: AsyncSession,
) -> None:
    """The seed creates what is missing; it never re-asserts what exists.

    This is the "safe administrative editing policy" the specification asks of
    the reference tables, stated as a test: a correction the operator makes is
    theirs, and a deploy that re-seeds must not undo it. Only `super_admin`'s
    grant set is an invariant the seed restores — deliberately, and for the
    reason `app/seed.py` gives.
    """
    await seed(session)
    general = await session.scalar(select(Discipline).where(Discipline.code == "general"))
    assert general is not None
    general.name = "General Works"
    general.is_active = False
    await session.flush()

    await seed(session)

    assert general.name == "General Works"
    assert general.is_active is False


# --- what the database enforces on the table ----------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_code_cannot_be_duplicated(session: AsyncSession) -> None:
    session.add(Discipline(code="electrical", name="Electrical"))
    await session.flush()
    session.add(Discipline(code="electrical", name="Electrical, the second one"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    # The naming convention (F023) is what makes the error name the index.
    assert "ix_disciplines_code" in str(caught.value.orig)


@pytest.mark.parametrize(
    ("label", "code"),
    [
        ("a capital letter", "Electrical"),
        ("a separator", "elec-trical"),
        ("leading space", " electrical"),
        ("digits first", "3phase"),
        ("empty", ""),
    ],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_malformed_code_is_refused_by_the_database(
    session: AsyncSession, label: str, code: str
) -> None:
    session.add(Discipline(code=code, name="Well named"))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_disciplines_code_is_well_formed" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_blank_name_is_refused_by_the_database(session: AsyncSession) -> None:
    session.add(Discipline(code="unused", name="   "))

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_disciplines_name_is_present" in str(caught.value.orig)
