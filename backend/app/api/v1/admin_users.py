"""Admin user directory (F033) — HTTP plumbing over ``app/services/users.py``.

Six endpoints, five permission codes, one translation table. The guards are
F031's dependencies (``require_permission``, which itself rides the gated
``current_session`` — no endpoint here is reachable during a forced password
change), and every business refusal from the service becomes a status the
frontend already understands:

| service exception | answer |
|---|---|
| ``UserNotFound`` | 404 |
| ``EmailAlreadyInUse`` | 409 (the email is a conflict with stored state) |
| ``LastSuperuser`` | 409 (the change would orphan the platform) |
| ``UnknownRoles`` / ``PasswordPolicyViolation`` | 422, field-addressable |
| ``MissingPermission`` | 403 (the generic permission message) |
| ``ProtectedSuperuser`` / ``PrivilegeEscalation`` / ``SelfModification`` / ``SelfDeletion`` | 403 with a rule-specific message |

The distinction between the two kinds of 403 is deliberate: the *guard's*
403 means "you do not hold the code this endpoint needs" and stays generic;
the *rule* 403s are raised for callers who do hold the code and describe the
rule they hit. Neither reveals anything about the target's data.
"""

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import PERMISSION_DENIED_DETAIL, require_permission
from app.api.v1.errors import field_error
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.schemas.admin_users import (
    AdminUserItem,
    CreateUserRequest,
    CreateUserResponse,
    ResetPasswordResponse,
    UpdateUserRequest,
    UserListResponse,
)
from app.services import users as users_service
from app.services.passwords import PasswordPolicyViolation
from app.services.sessions import SessionContext

router = APIRouter(prefix="/admin/users")

# Everything the service can deliberately refuse with; the translator below
# turns each into the one HTTP answer it means.
DOMAIN_ERRORS = (
    users_service.UserNotFound,
    users_service.EmailAlreadyInUse,
    users_service.LastSuperuser,
    users_service.UnknownRoles,
    PasswordPolicyViolation,
    users_service.MissingPermission,
    users_service.ProtectedSuperuser,
    users_service.PrivilegeEscalation,
    users_service.SelfModification,
    users_service.SelfDeletion,
)


def _to_http(exc: Exception) -> HTTPException:
    """The single translation table (module docstring): service rule → status.

    ``from exc`` chains the original, so a traceback still shows which rule
    fired. Every message is written for the admin reading the dialog.
    """
    if isinstance(exc, users_service.UserNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if isinstance(exc, users_service.EmailAlreadyInUse):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists.",
        )
    if isinstance(exc, users_service.LastSuperuser):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This is the last active super-admin; the account cannot be deactivated or deleted.",
        )
    if isinstance(exc, users_service.UnknownRoles):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error("role_ids", "One or more of the selected roles do not exist.")],
        )
    if isinstance(exc, PasswordPolicyViolation):
        # F030's exception, same field-addressable rendering — the field here
        # is the initial password the admin typed.
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error("password", message) for message in exc.violations],
        )
    if isinstance(exc, users_service.MissingPermission):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PERMISSION_DENIED_DETAIL)
    if isinstance(exc, users_service.ProtectedSuperuser):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a super-admin can manage a super-admin account.",
        )
    if isinstance(exc, users_service.PrivilegeEscalation):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot grant a role that includes permissions you do not hold.",
        )
    if isinstance(exc, users_service.SelfModification):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot change your own roles or account status.",
        )
    if isinstance(exc, users_service.SelfDeletion):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot delete your own account.",
        )
    raise exc


@router.get(
    "",
    response_model=UserListResponse,
    summary="List the user directory",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the users.read permission."},
    },
)
async def list_users(
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.USERS_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    search: Annotated[str | None, Query(max_length=100)] = None,
    is_active: Annotated[bool | None, Query()] = None,
    sort: Annotated[
        Literal["full_name", "email", "created_at", "last_login_at"], Query()
    ] = "created_at",
    order: Annotated[Literal["asc", "desc"], Query()] = "desc",
) -> UserListResponse:
    """One page of accounts, newest first by default.

    Soft-deleted accounts never appear — they are audit material (F024), not
    directory entries. ``total`` counts everything the filters match, so the
    table footer can count without lying (ARCHITECTURE §10).
    """
    users, total = await users_service.list_users(
        session,
        page=page,
        page_size=page_size,
        search=search,
        is_active=is_active,
        sort=sort,
        order=order,
    )
    return UserListResponse(
        items=[AdminUserItem.from_user(user) for user in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "",
    response_model=CreateUserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account with a temporary password",
    responses={
        401: {"description": "No usable session was presented."},
        403: {
            "description": (
                "Missing users.create, creating a super-admin without being one, "
                "or granting a role that exceeds the caller's own permissions."
            )
        },
        409: {"description": "The email address is already in use."},
        422: {"description": "Shape errors, unknown role ids, or a policy-refused password."},
    },
)
async def create_user(
    payload: CreateUserRequest,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.USERS_CREATE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CreateUserResponse:
    """Create the account; the response carries the temporary password
    **exactly once**, and only when the server generated it (an admin who
    supplied one already has it). The account starts ``must_change_password``.
    """
    try:
        user, temporary = await users_service.create_user(
            session,
            actor=context.user,
            email=str(payload.email),
            full_name=payload.full_name,
            phone=payload.phone,
            role_ids=payload.role_ids,
            is_superuser=payload.is_superuser,
            password=payload.password,
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return CreateUserResponse(user=AdminUserItem.from_user(user), temporary_password=temporary)


@router.get(
    "/{user_id}",
    response_model=AdminUserItem,
    summary="One account",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the users.read permission."},
        404: {"description": "No such user (soft-deleted accounts answer 404 too)."},
    },
)
async def get_user(
    user_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.USERS_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserItem:
    try:
        user = await users_service.get_user(session, user_id)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return AdminUserItem.from_user(user)


@router.patch(
    "/{user_id}",
    response_model=AdminUserItem,
    summary="Edit an account",
    responses={
        400: {"description": "An empty edit (no fields set)."},
        401: {"description": "No usable session was presented."},
        403: {
            "description": (
                "Missing users.update (or users.deactivate for the is_active "
                "toggle), a protected account, an escalation attempt, or a "
                "self-change of roles/status."
            )
        },
        404: {"description": "No such user."},
        409: {"description": "The email address is already in use."},
        422: {"description": "Shape errors or unknown role ids."},
    },
)
async def update_user(
    user_id: uuid.UUID,
    payload: UpdateUserRequest,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.USERS_UPDATE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserItem:
    """A partial edit; ``role_ids`` replaces the whole role set when present.

    Flipping ``is_active`` additionally requires ``users.deactivate`` — the
    router guard cannot know which fields a payload will touch, so the
    service raises ``MissingPermission`` and the translator answers the
    generic permission 403.
    """
    changes: dict[str, Any] = payload.model_dump(exclude_unset=True, exclude={"role_ids"})
    if "role_ids" in payload.model_fields_set:
        changes["role_ids"] = payload.role_ids or []
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No changes were submitted.",
        )
    try:
        target = await users_service.get_user(session, user_id)
        updated = await users_service.update_user(
            session, actor=context.user, target=target, changes=changes
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return AdminUserItem.from_user(updated)


@router.post(
    "/{user_id}/reset-password",
    response_model=ResetPasswordResponse,
    summary="Reset a user's password",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing users.reset_password, or a protected super-admin account."},
        404: {"description": "No such user."},
    },
)
async def reset_password_endpoint(
    user_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.USERS_RESET_PASSWORD))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ResetPasswordResponse:
    """The recovery path (no email flow exists): a generated temporary
    credential shown **exactly once**, a forced change at next sign-in, and
    every session of the target revoked (F030's mechanics, reason ``admin``)."""
    try:
        target = await users_service.get_user(session, user_id)
        temporary = await users_service.reset_user_password(
            session, actor=context.user, target=target
        )
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
    return ResetPasswordResponse(temporary_password=temporary)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete an account",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing users.deactivate, or a self/last-super-admin refusal."},
        404: {"description": "No such user."},
        409: {"description": "The account is the last active super-admin."},
    },
)
async def delete_user(
    user_id: uuid.UUID,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.USERS_DEACTIVATE))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Deactivates and marks deleted — the row survives for audit, sessions
    end, and the email stays occupied (an account is never silently reborn)."""
    try:
        target = await users_service.get_user(session, user_id)
        await users_service.delete_user(session, actor=context.user, target=target)
    except DOMAIN_ERRORS as exc:
        raise _to_http(exc) from exc
