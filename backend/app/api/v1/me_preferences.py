"""The signed-in user's preferences (F041, §8.3's `/auth/me/preferences`).

Three endpoints, all gated by ``current_session`` — these are **regular
endpoints** (C30): a forced password change blocks them like any other
mutation, because managing display preferences before settling the credential
is nothing anybody needs to do. The id they operate on is never a parameter —
it is the session's user, resolved per request (F029), which is the whole
isolation story; the service's queries filter by it in SQL.

DELETE is idempotent (204 whether or not a row existed): "this key has no
preference" is the goal state, and saying 404 would make the caller's own
cleanup code branch on something it cannot change. A key that could never
have existed (bad shape) is still a 422 — it is a client bug, addressed at
the path segment that carried it.
"""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_session
from app.core.database import get_session
from app.models.preferences import MAX_PREFERENCE_KEY_LENGTH, PREFERENCE_KEY_PATTERN
from app.schemas.preferences import PreferenceItem, PreferencesResponse, PutPreferenceRequest
from app.services import preferences as preferences_service
from app.services.sessions import SessionContext

router = APIRouter(prefix="/auth/me/preferences")

_KEY_RE = re.compile(PREFERENCE_KEY_PATTERN)


def _validated_key_or_422(key: str) -> str:
    cleaned = key.strip()
    if len(cleaned) > MAX_PREFERENCE_KEY_LENGTH or not _KEY_RE.fullmatch(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[
                {
                    "type": "value_error",
                    "loc": ["path", "key"],
                    "msg": (
                        "Preference keys are lowercase, may contain dots, dashes and "
                        "underscores, and are at most 100 characters."
                    ),
                }
            ],
        )
    return cleaned


@router.get(
    "",
    response_model=PreferencesResponse,
    summary="List the signed-in user's preferences",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Password change pending."},
    },
)
async def list_preferences(
    context: Annotated[SessionContext, Depends(current_session)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PreferencesResponse:
    rows = await preferences_service.list_preferences(session, context.user.id)
    return PreferencesResponse(items=[PreferenceItem(key=row.key, value=row.value) for row in rows])


@router.put(
    "/{key}",
    response_model=PreferenceItem,
    summary="Set one preference",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Password change pending."},
        422: {"description": "Malformed key, a null value, or an oversized value."},
    },
)
async def put_preference(
    key: str,
    payload: PutPreferenceRequest,
    context: Annotated[SessionContext, Depends(current_session)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PreferenceItem:
    cleaned = _validated_key_or_422(key)
    row = await preferences_service.put_preference(
        session, user_id=context.user.id, key=cleaned, value=payload.value
    )
    return PreferenceItem(key=row.key, value=row.value)


@router.delete(
    "/{key}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove one preference",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Password change pending."},
        422: {"description": "Malformed key."},
    },
)
async def delete_preference(
    key: str,
    context: Annotated[SessionContext, Depends(current_session)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    cleaned = _validated_key_or_422(key)
    await preferences_service.delete_preference(session, user_id=context.user.id, key=cleaned)
