"""The people table (D011) — and the name that is one column.

The task's acceptance is **no split name tests**, so that is what this file
opens with: the schema cannot hold a first name and a last name, because there
is exactly one name-bearing column and it holds the whole name. `PRODUCT_SPEC`
§3 asks for it in three words ("Do not split name"); the tests below are those
three words as executable statements, and they run before any database is
reached because a shape is a fact about the model.

Around that, the rest of what the table promises:

- **`employee_id` is the identity** — unique in the database (the index, not a
  service check), and *business data*: no slug pattern, so `EMP-0042` is a
  well-formed id. A pattern that refused one would be a defect.
- **Two foreign keys, both restrictive.** A person naming a designation that
  does not exist is refused; so is a designation a person still holds being
  deleted. The login link is the same shape, nullable: most people have none
  (`PRODUCT_SPEC` §3), one login serves one person, and a linked account cannot
  be hard-deleted.
- **`status` is a closed pair** and **both dates are optional but ordered** —
  an end before a hire is a typo the database refuses, a NULL on either side is
  simply "not recorded yet".

Two things are deliberately absent and pinned as such: **no rows ship** (the
specification names no initial employees, so `app/seed.py` must not invent any)
and **no permission code, no route and no audit vocabulary** — this is a schema
task, and a code or an audit event nothing writes is what C52 refused.

The pure tests at the top need no database and deliberately carry no
`integration` marker; `tests/test_markers.py` fails in both directions.
"""

import re
import uuid
from datetime import date, timedelta
from typing import cast

import pytest
from sqlalchemy import CheckConstraint, Index, String, Table, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import Department, Designation, Discipline, Employee, User
from app.models.employees import (
    EMPLOYEE_STATUSES,
    MAX_EMPLOYEE_ID_LENGTH,
    MAX_NAME_LENGTH,
    MAX_STATUS_LENGTH,
)
from app.seed import seed

# The columns that would mean someone split the name after all. A deny-list on
# purpose: the check has to fail when a *future* task adds `previous_name`, so
# it is written as the rule ("one name-bearing column") plus the names a split
# usually takes, not as an equality against today's shape alone.
SPLIT_NAME_COLUMNS = (
    "first_name",
    "last_name",
    "middle_name",
    "surname",
    "given_name",
    "family_name",
    "previous_name",
    "name_parts",
)


def columns() -> dict[str, object]:
    return dict(cast(Table, Employee.__table__).c)


def checks() -> dict[str, str]:
    return {
        str(constraint.name): str(constraint.sqltext)
        for constraint in cast(Table, Employee.__table__).constraints
        if isinstance(constraint, CheckConstraint)
    }


def indexes() -> dict[str, Index]:
    found = {str(index.name): index for index in cast(Table, Employee.__table__).indexes}
    assert set(found) == {
        "ix_employees_employee_id",
        "ix_employees_designation_id",
        "ix_employees_user_id",
    }
    return found


# --- pure: the acceptance — the name is one column ----------------------------


def test_the_name_cannot_be_split() -> None:
    """`PRODUCT_SPEC` §3: "Do not split name". Two assertions, because either
    alone is escapable: no column is a name *part* by name, and the only
    name-bearing column is the whole name."""
    present = set(columns())

    assert not present & set(SPLIT_NAME_COLUMNS), sorted(present & set(SPLIT_NAME_COLUMNS))

    # The generic half — a split can be spelled in a way the deny-list misses,
    # but it cannot avoid being a second column whose name ends in "name".
    assert [name for name in present if name.endswith("name")] == ["full_name"]


def test_the_whole_name_is_required_and_is_a_plain_string() -> None:
    """The one name column holds the name an operator typed: present, one
    string, the width every other name in this tree uses. No pattern, no
    ``NOT NULL`` pair of halves — nothing that would decide a name has parts."""
    full_name = cast(Table, Employee.__table__).c.full_name

    assert isinstance(full_name.type, String)
    assert full_name.type.length == MAX_NAME_LENGTH
    assert full_name.nullable is False
    assert "ck_employees_full_name_is_present" in checks()


def test_the_column_set_is_the_map_row_and_nothing_more() -> None:
    """§2's `employees` row exactly: the business id, the name, the designation,
    the status, the two dates and the login link — plus the F023 conventions."""
    assert set(columns()) == {
        "id",
        "created_at",
        "updated_at",
        "employee_id",
        "full_name",
        "designation_id",
        "status",
        "hire_date",
        "end_date",
        "user_id",
    }


# --- pure: the rest of the shape ----------------------------------------------


def test_the_status_vocabulary_is_the_pair_the_map_names() -> None:
    """A closed pair, built into the CHECK from the tuple, so the two cannot
    drift. The reference tables carry a boolean flag instead; this column is the
    specification's "active/employment status" and no boolean sits beside it."""
    assert EMPLOYEE_STATUSES == ("ACTIVE", "INACTIVE")
    assert checks()["ck_employees_status_is_known"] == "status IN ('ACTIVE', 'INACTIVE')"


def test_the_business_id_is_unique_and_carries_no_pattern() -> None:
    """The rule §3 states is uniqueness, so the index is the enforcement. The id
    is business data — `EMP-0042` must be writable — so the only CHECK on it is
    presence, which is what this pins: adding the reference tables' slug pattern
    here would fail this test rather than silently reject an operator's ids."""
    assert indexes()["ix_employees_employee_id"].unique
    assert checks()["ck_employees_employee_id_is_present"] == "length(trim(employee_id)) > 0"
    assert not any(re.search(r"~", sql) for sql in checks().values()), checks()


def test_the_two_foreign_keys_are_the_ones_the_map_draws() -> None:
    """`designation_id` required and restrictive (a person holds a title); the
    login link optional and restrictive (a link is a fact about an account, and
    C22 soft-deletes users rather than cascading through references)."""
    references = sorted(
        (fk.parent.name, fk.target_fullname, fk.ondelete, fk.parent.nullable)
        for fk in cast(Table, Employee.__table__).foreign_keys
    )

    assert references == [
        ("designation_id", "designations.id", "RESTRICT", False),
        ("user_id", "users.id", "RESTRICT", True),
    ]


def test_one_login_per_person_is_a_partial_unique_index() -> None:
    """The rule governs the rows that have a login. The predicate states that
    rather than leaning on Postgres treating `NULL`s as distinct — the reason
    `ix_cost_centres_project_id` is partial too (C70) — and it is what makes
    "every employee without an account" a row this index says nothing about."""
    index = indexes()["ix_employees_user_id"]

    assert index.unique
    assert str(index.dialect_options["postgresql"]["where"]) == "user_id IS NOT NULL"
    assert not indexes()["ix_employees_designation_id"].unique


def test_the_dates_are_optional_and_the_only_rule_between_them_is_order() -> None:
    """`PRODUCT_SPEC` §3's "optional hire/end dates": both nullable, and the one
    refusal is an end before a hire. Nothing ties a date to the status — an
    inactive row with no end date is data an import may legitimately carry."""
    table = cast(Table, Employee.__table__)

    assert table.c.hire_date.nullable is True
    assert table.c.end_date.nullable is True
    assert checks()["ck_employees_end_date_is_not_before_hire_date"] == "end_date >= hire_date"


def test_the_widths_are_the_ones_the_rest_of_the_tree_uses() -> None:
    """The same business-id and name widths `projects` and the reference tables
    use, so the tree cannot diverge on shape."""
    assert (MAX_EMPLOYEE_ID_LENGTH, MAX_NAME_LENGTH, MAX_STATUS_LENGTH) == (32, 200, 16)
    assert EMPLOYEE_STATUSES == ("ACTIVE", "INACTIVE")


# --- shared fixtures, built by hand so no seed row is implied -----------------


async def a_designation(session: AsyncSession, code: str = "site_engineer") -> Designation:
    department = Department(code="site_a", name="Site A", classification="SITE")
    discipline = Discipline(code="civil", name="Civil")
    session.add_all([department, discipline])
    await session.flush()
    designation = Designation(
        code=code,
        name="Site Engineer",
        department_id=department.id,
        discipline_id=discipline.id,
    )
    session.add(designation)
    await session.flush()
    return designation


async def a_user(session: AsyncSession, email: str = "ada@example.com") -> User:
    user = User(
        email=email,
        full_name="Ada Lovelace",
        hashed_password=hash_password("correct horse battery staple"),
        roles=[],
    )
    session.add(user)
    await session.flush()
    return user


async def an_employee(session: AsyncSession, **overrides: object) -> Employee:
    designation_id = overrides.pop("designation_id", None)
    if designation_id is None:
        designation_id = (await a_designation(session)).id
    employee = Employee(
        employee_id=overrides.pop("employee_id", "emp_0001"),
        full_name=overrides.pop("full_name", "Fatima Al-Zahra bint Mohammed"),
        designation_id=designation_id,
        status=overrides.pop("status", "ACTIVE"),
        **overrides,
    )
    session.add(employee)
    await session.flush()
    return employee


# --- what the database enforces: the name, as data ----------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_name_with_spaces_and_punctuation_round_trips_whole(
    session: AsyncSession,
) -> None:
    """The acceptance, against a real row: a name is stored and read back
    byte-for-byte in one column. A compound name with an apostrophe — the shape
    a first/last split mangles — is exactly what one column cannot get wrong."""
    written = "Nour Al-Din O'Brien"
    await an_employee(session, full_name=written)

    row = (await session.scalars(select(Employee))).one()
    assert row.full_name == written
    assert row.hire_date is None and row.end_date is None, "the dates ship unset"
    assert row.user_id is None, "no login is the ordinary case"
    # The F023 conventions reach this table too.
    assert row.id.version == 7
    assert row.created_at.utcoffset() == timedelta(0)


# --- what the database enforces: uniqueness -----------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_business_id_cannot_be_duplicated(session: AsyncSession) -> None:
    designation = await a_designation(session)
    await an_employee(session, employee_id="emp_0042", designation_id=designation.id)
    # Same id, different person: the index is the identity, not the name.
    session.add(
        Employee(
            employee_id="emp_0042",
            full_name="Someone Else",
            designation_id=designation.id,
            status="ACTIVE",
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ix_employees_employee_id" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_two_people_may_share_a_designation_and_have_no_login(
    session: AsyncSession,
) -> None:
    """Nothing is unique on the designation, and the login index says nothing
    about the rows that have no login — so the ordinary case (many people, one
    title, no accounts) is the case the indexes permit."""
    designation = await a_designation(session)
    await an_employee(session, employee_id="emp_0001", designation_id=designation.id)
    await an_employee(session, employee_id="emp_0002", designation_id=designation.id)

    assert await session.scalar(select(func.count()).select_from(Employee)) == 2


# --- what the database enforces: the designation reference ---------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_designation_that_does_not_exist_is_refused(session: AsyncSession) -> None:
    session.add(
        Employee(
            employee_id="emp_0001",
            full_name="Fatima Al-Zahra bint Mohammed",
            designation_id=uuid.uuid4(),  # well-formed, and not a row
            status="ACTIVE",
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_employees_designation_id_designations" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_designation_may_not_be_missing(session: AsyncSession) -> None:
    """A person with no designation is not a row this table represents; the
    reference is required, so a NULL is refused by the constraint whatever wrote
    it."""
    missing = cast(uuid.UUID, None)
    session.add(
        Employee(
            employee_id="emp_0001",
            full_name="Fatima Al-Zahra bint Mohammed",
            designation_id=missing,
            status="ACTIVE",
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "designation_id" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_designation_a_person_still_holds_cannot_be_deleted(
    session: AsyncSession,
) -> None:
    """`ON DELETE RESTRICT`, from the wrong side: the deleter is the parent, and
    the database refuses while an employee still names it (D004's policy)."""
    employee = await an_employee(session)
    designation = await session.get(Designation, employee.designation_id)

    await session.delete(designation)

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_employees_designation_id_designations" in str(caught.value.orig)


# --- what the database enforces: the login link --------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_login_serves_one_person(session: AsyncSession) -> None:
    designation = await a_designation(session)
    user = await a_user(session)
    await an_employee(
        session, employee_id="emp_0001", designation_id=designation.id, user_id=user.id
    )
    session.add(
        Employee(
            employee_id="emp_0002",
            full_name="Someone Else",
            designation_id=designation.id,
            status="ACTIVE",
            user_id=user.id,
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ix_employees_user_id" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_login_that_does_not_exist_is_refused(session: AsyncSession) -> None:
    designation = await a_designation(session)
    session.add(
        Employee(
            employee_id="emp_0001",
            full_name="Fatima Al-Zahra bint Mohammed",
            designation_id=designation.id,
            status="ACTIVE",
            user_id=uuid.uuid4(),
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_employees_user_id_users" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_linked_account_cannot_be_hard_deleted(session: AsyncSession) -> None:
    """RESTRICT, not SET NULL or CASCADE: the product soft-deletes users (C22),
    so a hard delete is deliberate surgery and the database makes it an explicit
    act rather than one that quietly blanks a link."""
    employee = await an_employee(session)
    user = await a_user(session)
    employee.user_id = user.id
    await session.flush()

    await session.delete(user)

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "fk_employees_user_id_users" in str(caught.value.orig)


# --- what the database enforces: the CHECKs ------------------------------------


@pytest.mark.parametrize("status", ["active", "ACTIVE ", "TERMINATED", "ON_LEAVE", ""])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_status_outside_the_pair_is_refused(session: AsyncSession, status: str) -> None:
    """The vocabulary is closed: the state is on the books or not. A third
    spelling — including a lowercase one and the event-type words that belong to
    D059–D063 rather than here — is a decision and a migration, which is the
    honest price of a column that stays groupable."""
    designation = await a_designation(session)
    session.add(
        Employee(
            employee_id="emp_0001",
            full_name="Fatima Al-Zahra bint Mohammed",
            designation_id=designation.id,
            status=status,
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_employees_status_is_known" in str(caught.value.orig)


@pytest.mark.parametrize(
    ("attribute", "constraint"),
    [
        ("employee_id", "ck_employees_employee_id_is_present"),
        ("full_name", "ck_employees_full_name_is_present"),
    ],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_blank_required_string_is_refused(
    session: AsyncSession, attribute: str, constraint: str
) -> None:
    designation = await a_designation(session)
    session.add(
        Employee(
            employee_id="   " if attribute == "employee_id" else "emp_0001",
            full_name="   " if attribute == "full_name" else "Fatima Al-Zahra bint Mohammed",
            designation_id=designation.id,
            status="ACTIVE",
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert constraint in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_an_end_before_the_hire_is_refused(session: AsyncSession) -> None:
    """The only rule between the two optional dates: someone who left before
    they arrived is a typo, and so is an end with no hire to be after… except
    that one is *allowed*, because a NULL on either side means "not recorded"
    rather than "wrong"."""
    designation = await a_designation(session)
    session.add(
        Employee(
            employee_id="emp_0001",
            full_name="Fatima Al-Zahra bint Mohammed",
            designation_id=designation.id,
            status="INACTIVE",
            hire_date=date(2026, 3, 1),
            end_date=date(2026, 2, 28),
        )
    )

    with pytest.raises(IntegrityError) as caught:
        await session.flush()

    assert "ck_employees_end_date_is_not_before_hire_date" in str(caught.value.orig)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_dates_are_each_optional_and_may_be_equal(session: AsyncSession) -> None:
    """Three shapes the product has to accept: a hire with no end yet, an end
    with no hire recorded, and a one-day record — the boundary the CHECK's `>=`
    is precisely about."""
    designation = await a_designation(session)
    await an_employee(
        session,
        employee_id="emp_0001",
        designation_id=designation.id,
        hire_date=date(2026, 3, 1),
    )
    await an_employee(
        session,
        employee_id="emp_0002",
        designation_id=designation.id,
        end_date=date(2026, 3, 1),
    )
    await an_employee(
        session,
        employee_id="emp_0003",
        designation_id=designation.id,
        hire_date=date(2026, 3, 1),
        end_date=date(2026, 3, 1),
    )

    assert await session.scalar(select(func.count()).select_from(Employee)) == 3


# --- no rows ship --------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_seeding_a_migrated_database_invents_no_employees(session: AsyncSession) -> None:
    """`D011` ships no initial values, so the seed's job here is to do nothing
    to this table — it creates the seven disciplines and the Head Office cost
    centre, and creates no person."""
    report = await seed(session)

    assert report.disciplines_created == 7
    assert await session.scalar(select(func.count()).select_from(Employee)) == 0
