"""The reference tables: the rules behind the three CRUD endpoints (D005).

`app/api/v1/masters.py` stays thin; the decisions live here (C26's split,
applied to Stage B). The three resources share one contract, so they share one
set of rules — and one set of exceptions, each carrying the sentence the client
reads. That is deliberate: "a code that already exists" means the same thing
for a discipline, a department and a designation, and nine near-identical
exception classes (one per resource per failure) would be nine places for the
wording to drift. D011–D013 add more tables to this group and inherit these.

The rules, in the order a request meets them:

- **The code is the identity and is set once.** `create` writes it; nothing
  here changes it. A code is what stored rows and later modules point at, so
  renaming one would rewrite the meaning of every reference to it silently.
  The unique index is what makes the identity real — two requests that race to
  create the same code cannot both win, and the loser is a 409, not a duplicate
  that quietly exists.
- **Deactivate rather than delete, where the row is referenced.** `delete`
  attempts the real delete and translates the database's refusal into a 409.
  The refusal is `ON DELETE RESTRICT` (D004) — the database's rule, not a
  count this service keeps — so a discipline or department still named by a
  designation cannot be removed, and when D014's employees reference
  designations that table is covered by the same line of code. A row nothing
  references is free to go: the reference tables are the operator's vocabulary,
  and a typo created a minute ago should not have to be deactivated forever.
  The product's answer for a row that *is* used is the flag, which the update
  path offers.
- **A reference must name a row that exists, and says so like a field.** The
  two foreign keys would refuse an unknown department or discipline at commit
  time, which a caller reads as a 500; the check here turns it into a 422
  addressed to `department_id` / `discipline_id`, the same shape F037's unknown
  permission codes use. The foreign keys stay the floor — this is the message,
  not the mechanism.
- **Every mutation is audited, in its own transaction.** `audit.record` adds
  the event to the session this function then commits, so a change without its
  event cannot commit and an event without its change cannot either (F043).
  A **deactivation is an update**: `is_active` moves inside the before/after
  diff rather than in an event of its own (see `AUDIT_ACTIONS`).
- **Reads are complete, not filtered.** Lists return every row including the
  deactivated ones, sorted by code — the table's own identity order. A screen
  that must not offer an inactive row filters it out where it renders the
  picker; a list that hid those rows would make "deactivated" and "gone"
  indistinguishable to the operator who deactivated something by mistake.

The `None`-means-not-submitted rule the routers rely on: nothing in the schemas
is nullable, so a field left at `None` is a field the caller did not submit.
That is why the edit functions take keywords rather than a `changes` dict —
`None` already carries the meaning, and the signature stays honest about types.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import User
from app.models.masters import Department, Designation, Discipline
from app.services import audit


class MasterNotFound(Exception):
    """No such row. The message names the resource ("Discipline not found.")."""


class MasterCodeTaken(Exception):
    """Another row already carries this code (the unique index's verdict)."""


class MasterInUse(Exception):
    """A foreign key refused the delete: something still references this row.

    Raised from the database's own `ON DELETE RESTRICT` rather than from a
    count kept here — one implementation of the rule, and it covers tables
    this module has not met yet.
    """


class UnknownReference(Exception):
    """A submitted reference names no row, addressed to the field it came in
    on so the form layer can put the message on the right control."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


# --- disciplines --------------------------------------------------------------


async def list_disciplines(session: AsyncSession) -> list[Discipline]:
    """Every discipline, active or not, sorted by code."""
    return list(await session.scalars(select(Discipline).order_by(Discipline.code.asc())))


async def get_discipline(session: AsyncSession, discipline_id: uuid.UUID) -> Discipline:
    discipline = await session.get(Discipline, discipline_id)
    if discipline is None:
        raise MasterNotFound("Discipline not found.")
    return discipline


async def create_discipline(
    session: AsyncSession, *, actor: User, code: str, name: str
) -> Discipline:
    discipline = Discipline(code=code, name=name)
    session.add(discipline)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise MasterCodeTaken("A discipline with this code already exists.") from error
    await audit.record(
        session,
        actor=actor,
        action="discipline.create",
        entity_type="discipline",
        entity_id=discipline.id,
        summary=f"Created discipline {discipline.code}.",
        details={"code": discipline.code, "name": discipline.name},
    )
    await session.commit()
    return discipline


async def update_discipline(
    session: AsyncSession,
    *,
    actor: User,
    target: Discipline,
    name: str | None,
    is_active: bool | None,
) -> Discipline:
    """Rename and/or deactivate. Both fields are optional; neither is the code."""
    before: dict[str, object] = {"name": target.name, "is_active": target.is_active}
    if name is not None:
        target.name = name
    if is_active is not None:
        target.is_active = is_active
    await audit.record(
        session,
        actor=actor,
        action="discipline.update",
        entity_type="discipline",
        entity_id=target.id,
        summary=f"Updated discipline {target.code}.",
        details={
            "before": before,
            "after": {"name": target.name, "is_active": target.is_active},
        },
    )
    await session.commit()
    # `updated_at` is IO after an UPDATE (ARCHITECTURE §12) — refresh before
    # anything serialises the row.
    await session.refresh(target)
    return target


async def delete_discipline(session: AsyncSession, *, actor: User, target: Discipline) -> None:
    """Delete a discipline nothing references; 409 while a designation names it."""
    await audit.record(
        session,
        actor=actor,
        action="discipline.delete",
        entity_type="discipline",
        entity_id=target.id,
        summary=f"Deleted discipline {target.code}.",
        details={"code": target.code},
    )
    await session.delete(target)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise MasterInUse(
            "This discipline is still used by designations and cannot be deleted. "
            "Deactivate it instead."
        ) from error


# --- departments --------------------------------------------------------------


async def list_departments(session: AsyncSession) -> list[Department]:
    """Every department, active or not, sorted by code."""
    return list(await session.scalars(select(Department).order_by(Department.code.asc())))


async def get_department(session: AsyncSession, department_id: uuid.UUID) -> Department:
    department = await session.get(Department, department_id)
    if department is None:
        raise MasterNotFound("Department not found.")
    return department


async def create_department(
    session: AsyncSession, *, actor: User, code: str, name: str, classification: str
) -> Department:
    department = Department(code=code, name=name, classification=classification)
    session.add(department)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise MasterCodeTaken("A department with this code already exists.") from error
    await audit.record(
        session,
        actor=actor,
        action="department.create",
        entity_type="department",
        entity_id=department.id,
        summary=f"Created department {department.code}.",
        details={
            "code": department.code,
            "name": department.name,
            "classification": department.classification,
        },
    )
    await session.commit()
    return department


async def update_department(
    session: AsyncSession,
    *,
    actor: User,
    target: Department,
    name: str | None,
    classification: str | None,
    is_active: bool | None,
) -> Department:
    """Rename, reclassify and/or deactivate. The code is not editable here."""
    before: dict[str, object] = {
        "name": target.name,
        "classification": target.classification,
        "is_active": target.is_active,
    }
    if name is not None:
        target.name = name
    if classification is not None:
        target.classification = classification
    if is_active is not None:
        target.is_active = is_active
    await audit.record(
        session,
        actor=actor,
        action="department.update",
        entity_type="department",
        entity_id=target.id,
        summary=f"Updated department {target.code}.",
        details={
            "before": before,
            "after": {
                "name": target.name,
                "classification": target.classification,
                "is_active": target.is_active,
            },
        },
    )
    await session.commit()
    await session.refresh(target)
    return target


async def delete_department(session: AsyncSession, *, actor: User, target: Department) -> None:
    """Delete a department nothing references; 409 while a designation names it."""
    await audit.record(
        session,
        actor=actor,
        action="department.delete",
        entity_type="department",
        entity_id=target.id,
        summary=f"Deleted department {target.code}.",
        details={"code": target.code},
    )
    await session.delete(target)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise MasterInUse(
            "This department is still used by designations and cannot be deleted. "
            "Deactivate it instead."
        ) from error


# --- designations -------------------------------------------------------------


async def list_designations(session: AsyncSession) -> list[Designation]:
    """Every designation, active or not, sorted by code."""
    return list(await session.scalars(select(Designation).order_by(Designation.code.asc())))


async def get_designation(session: AsyncSession, designation_id: uuid.UUID) -> Designation:
    designation = await session.get(Designation, designation_id)
    if designation is None:
        raise MasterNotFound("Designation not found.")
    return designation


async def create_designation(
    session: AsyncSession,
    *,
    actor: User,
    code: str,
    name: str,
    department_id: uuid.UUID,
    discipline_id: uuid.UUID,
) -> Designation:
    """Create a title under a department and a discipline that both exist."""
    await _require_department(session, department_id)
    await _require_discipline(session, discipline_id)
    designation = Designation(
        code=code, name=name, department_id=department_id, discipline_id=discipline_id
    )
    session.add(designation)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise MasterCodeTaken("A designation with this code already exists.") from error
    await audit.record(
        session,
        actor=actor,
        action="designation.create",
        entity_type="designation",
        entity_id=designation.id,
        summary=f"Created designation {designation.code}.",
        details={
            "code": designation.code,
            "name": designation.name,
            "department_id": str(designation.department_id),
            "discipline_id": str(designation.discipline_id),
        },
    )
    await session.commit()
    return designation


async def update_designation(
    session: AsyncSession,
    *,
    actor: User,
    target: Designation,
    name: str | None,
    department_id: uuid.UUID | None,
    discipline_id: uuid.UUID | None,
    is_active: bool | None,
) -> Designation:
    """Rename, move to another department or discipline, and/or deactivate."""
    before: dict[str, object] = {
        "name": target.name,
        "department_id": str(target.department_id),
        "discipline_id": str(target.discipline_id),
        "is_active": target.is_active,
    }
    if name is not None:
        target.name = name
    if department_id is not None:
        await _require_department(session, department_id)
        target.department_id = department_id
    if discipline_id is not None:
        await _require_discipline(session, discipline_id)
        target.discipline_id = discipline_id
    if is_active is not None:
        target.is_active = is_active
    await audit.record(
        session,
        actor=actor,
        action="designation.update",
        entity_type="designation",
        entity_id=target.id,
        summary=f"Updated designation {target.code}.",
        details={
            "before": before,
            "after": {
                "name": target.name,
                "department_id": str(target.department_id),
                "discipline_id": str(target.discipline_id),
                "is_active": target.is_active,
            },
        },
    )
    await session.commit()
    await session.refresh(target)
    return target


async def delete_designation(session: AsyncSession, *, actor: User, target: Designation) -> None:
    """Delete a designation nothing references.

    Nothing references designations yet, so in this revision the delete always
    succeeds and the `IntegrityError` arm is unreachable. It stays because the
    rule it enforces is the table's, not this revision's: D014's employees will
    carry a `designation_id`, and the day that lands this function already
    refuses correctly instead of raising a 500 — the same reason the model put
    the foreign key there before anything used it.
    """
    await audit.record(
        session,
        actor=actor,
        action="designation.delete",
        entity_type="designation",
        entity_id=target.id,
        summary=f"Deleted designation {target.code}.",
        details={"code": target.code},
    )
    await session.delete(target)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise MasterInUse(
            "This designation is still used by other records and cannot be deleted. "
            "Deactivate it instead."
        ) from error


async def _require_department(session: AsyncSession, department_id: uuid.UUID) -> None:
    if await session.get(Department, department_id) is None:
        raise UnknownReference("department_id", "No such department.")


async def _require_discipline(session: AsyncSession, discipline_id: uuid.UUID) -> None:
    if await session.get(Discipline, discipline_id) is None:
        raise UnknownReference("discipline_id", "No such discipline.")
