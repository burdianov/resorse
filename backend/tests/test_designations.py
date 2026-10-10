"""The third reference table (D004) — the references and the uniqueness.

The task's acceptance is **FK and uniqueness tests**: a designation is where
two other reference rows meet, so this file asserts both directions of each
reference and the one uniqueness rule the table has.

- **Uniqueness is on `code` alone.** A duplicate code is refused by the index;
  two designations that share a department and a discipline are *not* — the
  specification gives that pair a single-valued rule, not a unique one, and the
  pure test below pins that no composite uniqueness was invented.
- **Each reference is a `NOT NULL` foreign key with `ON DELETE RESTRICT`.** A
  designation naming a department or a discipline that does not exist is
  refused, one naming neither (a NULL) is refused, and a department or
  discipline that a designation still names cannot be deleted — the schema
  half of the product's "deactivate, never delete where a row is referenced"
  policy (DOMAIN_ARCHITECTURE §3). The pure test pins the ondelete behaviour
  and the nullability, because those are the choices `alembic check` cannot
  see the *reason* for.

Two things are deliberately absent and pinned as such: **no rows ship** (the
specification names no initial designations, so `app/seed.py` must not invent
any) and **no uniqueness beyond `code`**.

The pure tests at the top need no database and deliberately carry no
`integration` marker; `tests/test_markers.py` fails in both directions.
"""

import uuid
from datetime import timedelta
from typing import cast

import pytest
from sqlalchemy import Table, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Designation, Discipline
from app.models.masters import MAX_CODE_LENGTH, MAX_NAME_LENGTH
from app.seed import seed

# --- pure: the shape the map describes, before any database sees it -----------


def test_the_model_declares_exactly_the_two_references_the_map_names() -> None:
    """`PRODUCT_SPEC` §3 and DOMAIN_ARCHITECTURE §2/§3: two single-valued,
    required references. The ondelete is the decision D004 made — deactivate,
    never delete a referenced row — so it is asserted here rather than left to
    whichever default PostgreSQL happens to have."""
    references = sorted(
        (fk.parent.name, fk.target_fullname, fk.ondelete, fk.parent.nullable)
        for fk in cast(Table, Designation.__table__).foreign_keys
    )
    assert references == [
        ("department_id", "departments.id", "RESTRICT", False),
        ("discipline_id", "disciplines.id", "RESTRICT", False),
    ]


def test_the_indexes_are_the_code_uniqueness_and_one_per_reference() -> None:
    """The unique index on `code` is the identity; the other two exist because
    the question "which designations sit under this department / discipline?"
    is asked from the referenced side, which the primary key cannot serve."""
    indexes = {str(index.name): index for index in cast(Table, Designation.__table__).indexes}
    assert set(indexes) == {
        "ix_designations_code",
        "ix_designations_department_id",
        "ix_designations_discipline_id",
    }
    assert indexes["ix_designations_code"].unique
    assert not indexes["ix_designations_department_id"].unique
    assert not indexes["ix_designations_discipline_id"].unique


def test_uniqueness_is_on_the_code_alone() -> None:
    """No composite uniqueness was invented. Two departments may each have a
    "Supervisor"; the code, not the (department, discipline) pair, is what
    distinguishes them."""
    unique = {
        tuple(index.columns.keys())
        for index in cast(Table, Designation.__table__).indexes
        if index.unique
    }
    assert unique == {("code",)}


def test_the_third_table_reuses_the_reference_shape() -> None:
    """The same code and name widths `disciplines` and `departments` use, so
    the three reference tables cannot diverge on shape."""
    assert (MAX_CODE_LENGTH, MAX_NAME_LENGTH) == (32, 200)


# --- shared fixtures, built by hand so no seed row is implied -----------------


async def _a_department(session: AsyncSession, code: str = "site_a") -> Department:
    department = Department(code=code, name="Site A", classification="SITE")
    session.add(department)
    await session.flush()
    return department


async def _a_discipline(session: AsyncSession, code: str = "civil") -> Discipline:
    discipline = Discipline(code=code, name="Civil")
    session.add(discipline)
    await session.flush()
    return discipline


# --- what the database enforces: uniqueness -----------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_code_cannot_be_duplicated(session: AsyncSession) -> None:
    department = await _a_department(session, "site_a")
    discipline = await _a_discipline(session)
    session.add(
        Designation(
            code="supervisor",
            name="Supervisor",
            department_id=department.id,
            discipline_id=discipline.id,
        )
    )
    await session.flush()
    session.add(
        Designation(
            code="supervisor",
            name="The other one",
            department_id=department.id,
            discipline_id=discipline.id,
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    # The naming convention (F023) is what makes the error name the index.
    assert "ix_designations_code" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_two_designations_may_share_a_department_and_a_discipline(
    session: AsyncSession,
) -> None:
    """The uniqueness rule is the code, not the pair: nothing here is unique on
    (department, discipline), so a second title under the same two rows lands."""
    department = await _a_department(session, "site_a")
    discipline = await _a_discipline(session)
    session.add_all(
        [
            Designation(
                code="supervisor",
                name="Supervisor",
                department_id=department.id,
                discipline_id=discipline.id,
            ),
            Designation(
                code="foreman",
                name="Foreman",
                department_id=department.id,
                discipline_id=discipline.id,
            ),
        ]
    )
    await session.flush()

    assert await session.scalar(select(func.count()).select_from(Designation)) == 2


# --- what the database enforces: the two foreign keys -------------------------


@pytest.mark.parametrize(
    ("label", "attribute", "constraint"),
    [
        ("department", "department_id", "fk_designations_department_id_departments"),
        ("discipline", "discipline_id", "fk_designations_discipline_id_disciplines"),
    ],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_reference_to_a_row_that_does_not_exist_is_refused(
    session: AsyncSession, label: str, attribute: str, constraint: str
) -> None:
    department = await _a_department(session, "site_a")
    discipline = await _a_discipline(session)
    unknown = uuid.uuid4()  # well-formed, and not a row in either table
    session.add(
        Designation(
            code="supervisor",
            name="Supervisor",
            department_id=unknown if attribute == "department_id" else department.id,
            discipline_id=unknown if attribute == "discipline_id" else discipline.id,
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert constraint in str(caught.value.orig)


@pytest.mark.parametrize("attribute", ["department_id", "discipline_id"])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_missing_reference_is_refused_by_the_database(
    session: AsyncSession, attribute: str
) -> None:
    """Both references are required, not defaulted: a designation belongs to
    exactly one department and one discipline, so neither may be absent."""
    department = await _a_department(session, "site_a")
    discipline = await _a_discipline(session)
    # A NULL through an API that says the column cannot be one: exactly what a
    # NOT NULL constraint exists to catch, whichever layer wrote the row.
    missing = cast(uuid.UUID, None)
    session.add(
        Designation(
            code="supervisor",
            name="Supervisor",
            department_id=missing if attribute == "department_id" else department.id,
            discipline_id=missing if attribute == "discipline_id" else discipline.id,
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert attribute in str(caught.value.orig)


@pytest.mark.parametrize(
    ("label", "attribute", "constraint"),
    [
        ("department", "department_id", "fk_designations_department_id_departments"),
        ("discipline", "discipline_id", "fk_designations_discipline_id_disciplines"),
    ],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_referenced_parent_cannot_be_deleted(
    session: AsyncSession, label: str, attribute: str, constraint: str
) -> None:
    """`ON DELETE RESTRICT`, from the wrong side: the deleter is the parent, and
    the database refuses while a designation still names it."""
    department = await _a_department(session, "site_a")
    discipline = await _a_discipline(session)
    session.add(
        Designation(
            code="supervisor",
            name="Supervisor",
            department_id=department.id,
            discipline_id=discipline.id,
        )
    )
    await session.flush()

    parents = {"department_id": department, "discipline_id": discipline}
    await session.delete(parents[attribute])

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert constraint in str(caught.value.orig)


# --- the two shared CHECKs, and the F023 conventions --------------------------


@pytest.mark.parametrize(
    "code",
    ["Supervisor", "super-visor", " supervisor", "1st_foreman", ""],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_malformed_code_is_refused_by_the_database(
    session: AsyncSession, code: str
) -> None:
    department = await _a_department(session, "site_a")
    discipline = await _a_discipline(session)
    session.add(
        Designation(
            code=code, name="Well named", department_id=department.id, discipline_id=discipline.id
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_designations_code_is_well_formed" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_blank_name_is_refused_by_the_database(session: AsyncSession) -> None:
    department = await _a_department(session, "site_a")
    discipline = await _a_discipline(session)
    session.add(
        Designation(
            code="unused", name="   ", department_id=department.id, discipline_id=discipline.id
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_designations_name_is_present" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_well_formed_row_resolves_both_references_and_defaults(
    session: AsyncSession,
) -> None:
    department = await _a_department(session, "head_office")
    discipline = await _a_discipline(session)
    session.add(
        Designation(
            code="site_engineer",
            name="Site Engineer",
            department_id=department.id,
            discipline_id=discipline.id,
        )
    )
    await session.flush()

    row = (await session.scalars(select(Designation))).one()
    assert row.department_id == department.id
    assert row.discipline_id == discipline.id
    assert row.is_active, "a new row ships offered"
    # The F023 conventions reach this table too.
    assert row.id.version == 7
    assert row.created_at.utcoffset() == timedelta(0)


# --- no rows ship -------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_seeding_a_migrated_database_invents_no_designations(
    session: AsyncSession,
) -> None:
    """`D004` ships no initial values, so the seed's job here is to do nothing
    to this table. The seven disciplines prove the seed creates reference rows;
    this proves it creates only the ones the specification names."""
    report = await seed(session)

    assert report.disciplines_created == 7
    assert await session.scalar(select(func.count()).select_from(Designation)) == 0
