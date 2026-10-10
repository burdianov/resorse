"""A test-only extension module: `docs/ADDING_A_MODULE.md` §2, followed once.

F063's proof (BP-9.6, BP-9.7, BP-12-P7) needs a module that registers one route,
nav item, permission, model, migration and endpoint and is then *removed from
production navigation*. This is that module, and it lives in the test tree so
that nothing about it can ship: `app/api/v1/router.py` does not mount this
router, `app/models/__init__.py` does not import the model, and no revision
creates its table. `backend/tests/test_extension_contract.py` mounts it and
asserts what the contract promises.

Three divergences from the guide, each a consequence of *test-only* rather than
of the contract, and each recorded rather than smoothed over (§6):

1. **No `demo_records.*` permission code is invented.** `PermissionCode` is the
   one machine copy of the vocabulary the seed registers, and `require_permission`
   takes a member of it rather than a string precisely so a route cannot demand a
   near-miss. A member added for this proof would appear in the shipped permission
   dictionary, in `ALL_PERMISSION_CODES` and in every future seed run. The guards
   therefore use two codes that already exist — which is what §3's rule 1 requires
   of any module anyway: the route demands the codes the API enforces.
2. **No revision is added to `backend/migrations/versions/`.** A revision is
   applied state, and a demo table in the production migration tree is the very
   leakage this task exists to prevent. The table is created from the model on the
   test database instead, and the contract test asserts that Alembic's own
   autogenerate sees the model — the half of that step a test can hold.
3. **No audit event is written.** `AUDIT_ACTIONS` / `AUDIT_ENTITY_TYPES` are
   closed vocabularies enforced by database CHECKs, and `audit.record` refuses an
   unregistered pair. A real module registers its events — a one-line change plus
   a migration for the CHECK — and the contract test asserts that refusal instead
   of routing around it.

Everything else is the recipe unchanged: a model on the application `Base`, a
request/response schema pair, a service whose ownership predicate is SQL, a router
whose every endpoint carries a guard, and the commit in the endpoint.
"""

import uuid
from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import ForeignKey, String, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.api.v1.dependencies import require_permission
from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin, get_session
from app.core.permissions import PermissionCode
from app.models.identity import User
from app.services.sessions import SessionContext

RECORD_NOT_FOUND_DETAIL = "Demo record not found."


class DemoRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The module's table — the shape every migrated model has (F023's conventions)."""

    __tablename__ = "demo_records"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)


class DemoRecordCreate(BaseModel):
    """What the module accepts. One field, so the proof stays about the contract."""

    title: str = Field(min_length=1, max_length=200)


class DemoRecordItem(BaseModel):
    """What it returns. No owner id: the caller is the owner, and a response
    carrying the column would be an internal field leaked (F050's rule)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str


async def list_owned(session: AsyncSession, *, owner_id: uuid.UUID) -> Sequence[DemoRecord]:
    """The caller's rows, filtered in the query rather than over its results.

    `created_at` is `now()`, which PostgreSQL fixes at transaction start — so rows
    written by one unit of work share a timestamp and the column alone does not
    order them. The primary key is the tiebreaker: it is a UUIDv7, so it sorts in
    the order the rows were written.
    """
    rows = await session.scalars(
        select(DemoRecord)
        .where(DemoRecord.owner_id == owner_id)
        .order_by(DemoRecord.created_at, DemoRecord.id)
    )
    return rows.all()


async def get_owned(
    session: AsyncSession, *, owner_id: uuid.UUID, record_id: uuid.UUID
) -> DemoRecord | None:
    """Ownership in the same predicate as the lookup: a foreign id is **not found**,
    never forbidden — a 403 would confirm that the id exists."""
    return await session.scalar(
        select(DemoRecord).where(DemoRecord.id == record_id, DemoRecord.owner_id == owner_id)
    )


async def create_record(session: AsyncSession, *, owner: User, title: str) -> DemoRecord:
    """Adds and flushes. It does **not** commit: the commit belongs to the endpoint,
    once, at the end of the unit of work."""
    row = DemoRecord(owner_id=owner.id, title=title)
    session.add(row)
    await session.flush()
    return row


router = APIRouter()


@router.get("/records")
async def list_records(
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.FILES_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[DemoRecordItem]:
    rows = await list_owned(session, owner_id=context.user.id)
    return [DemoRecordItem.model_validate(row) for row in rows]


@router.post("/records", status_code=status.HTTP_201_CREATED)
async def create_demo_record(
    payload: DemoRecordCreate,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.FILES_CREATE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DemoRecordItem:
    row = await create_record(session, owner=context.user, title=payload.title)
    await session.commit()
    return DemoRecordItem.model_validate(row)


@router.get("/records/{record_id}")
async def read_record(
    record_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.FILES_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DemoRecordItem:
    row = await get_owned(session, owner_id=context.user.id, record_id=record_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=RECORD_NOT_FOUND_DETAIL,
        )
    return DemoRecordItem.model_validate(row)
