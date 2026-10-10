"""The Files API: authorized upload, download and delete (F050, BP-7.9a).

Five endpoints over `app/services/storage.py`. The split of codes follows the
one the seed already draws: **`files.create` is the write side** (upload, and
deleting your own file) and **`files.read` is the read side** (list, metadata,
download). `admin` holds both and `viewer` holds only read, which is what
"read-only oversight" means once files exist. There is no `files.delete`: the
canonical permission list in the requirements carries `files.read` and
`files.create` and says to add granular variants only as needed, and removing
what you put there is the same grant as putting it there.

Authorization is **ownership**, and it is structural in the same way F041's
preferences and F045's inbox are. Every lookup filters on the id *and* the
session's user id in one SQL predicate, so another account's file is **not
found** (404) rather than *forbidden* — a 403 would confirm the id exists. A
null owner means a system artifact; no endpoint here can create one, and none
can see one, so those rows are the report pipeline's business (F053).

Two details worth naming because they are the subject of BP-6.4:

- **The size cap is applied before the body is in memory.** `UploadFile` is
  read with a limit one byte over the cap, so an oversized upload is refused
  without ever holding all of it — a cap enforced after buffering is a cap that
  only protects the disk.
- **What leaves is marked, not merely typed.** A download carries the sniffed
  `Content-Type`, `Content-Disposition: attachment` with an ASCII fallback and
  an RFC 5987 encoded name (so a document never renders as a page in the
  caller's origin), `X-Content-Type-Options: nosniff`, and
  `Cache-Control: private, no-store`.

Everything rides the gated ``current_session``: a pending password change
outranks the file browser (C30's rule, applied again).
"""

import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_permission
from app.api.v1.errors import field_error
from app.core.config import get_settings
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.models.files import FileAsset
from app.schemas.files import FileItem, FileListResponse
from app.services import storage
from app.services.sessions import SessionContext

router = APIRouter(prefix="/files")


def content_disposition(filename: str) -> str:
    """The header that makes a download a download, for any filename.

    Two names, because no single one works everywhere: an ASCII fallback for
    clients that ignore RFC 5987, and the real name percent-encoded after
    ``filename*``. Anything outside ASCII becomes ``_`` in the fallback, so the
    encoding cannot be broken either.

    The name is passed through :func:`storage.sanitise_filename` rather than
    trusted to have been: the route hands it the stored name, which has already
    had quotes and control characters removed, and sanitising is idempotent — so
    this is a header that cannot be broken *by its own caller*, which is the
    only kind of safety worth having here (a CR/LF in a header value is an
    injected header).
    """
    name = storage.sanitise_filename(filename)
    fallback = name.encode("ascii", "replace").decode("ascii").replace("?", "_")
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(name, safe='')}"


@router.post(
    "",
    response_model=FileItem,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a file",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing files.create or a pending password change."},
        422: {"description": "The upload was refused (size, type, contents or category)."},
    },
)
async def upload_file(
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.FILES_CREATE))],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File(description="The file's bytes.")],
    category: Annotated[str, Form(description="A slug like `templates` or `reports`.")],
    scanner: Annotated[storage.MalwareScanner, Depends(storage.get_malware_scanner)],
) -> FileItem:
    """Store one upload, recording what its bytes are rather than what they claim.

    The declared type is passed through as a *hint* only: the storage service
    may use it to refine one case (a text file that is a CSV) and can never use
    it to widen the allowlist. A refusal that concerns the file arrives on the
    `file` field so the SPA's form mapper can put it where the user is looking.
    """
    limit = get_settings().storage_max_upload_bytes
    # One byte over the cap is all this ever holds: enough to know the upload
    # is too big, never enough to be the problem it refuses.
    data = await file.read(limit + 1)
    try:
        asset = await storage.upload_file(
            session,
            actor=context.user,
            data=data,
            original_filename=file.filename or "",
            category=category,
            declared_content_type=file.content_type,
            scanner=scanner,
        )
    except storage.FileTooLarge as refused:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error("file", str(refused))],
        ) from refused
    except storage.UnsupportedFileType as refused:
        # ContentTypeMismatch is a subclass and deliberately lands here too:
        # from the caller's side both are "this file will not be stored as
        # what it claims to be".
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error("file", str(refused))],
        ) from refused
    except storage.MalwareDetected as refused:
        # Not a field error: nothing the user typed is wrong with this file,
        # and no scanner is wired in yet (NoMalwareScanner). 400 says "refused"
        # without pretending to be a validation message.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This file was refused by the malware scan.",
        ) from refused
    except storage.StorageError as refused:
        # What is left is the category: the one refusal that is about a field
        # of the request rather than about the bytes.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[field_error("category", str(refused))],
        ) from refused
    return FileItem.model_validate(asset)


@router.get(
    "",
    response_model=FileListResponse,
    summary="List your files",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing files.read or a pending password change."},
    },
)
async def list_files(
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.FILES_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> FileListResponse:
    """The caller's own library, newest first. There is no parameter that could
    name another account."""
    rows, total = await storage.list_files(
        session, user_id=context.user.id, page=page, page_size=page_size
    )
    return FileListResponse(
        items=[FileItem.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{file_id}",
    response_model=FileItem,
    summary="Read a file's metadata",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing files.read or a pending password change."},
        404: {"description": "No such file belongs to the caller."},
    },
)
async def read_file_metadata(
    file_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.FILES_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileItem:
    asset = await _owned_or_404(session, context, file_id)
    return FileItem.model_validate(asset)


@router.get(
    "/{file_id}/content",
    summary="Download a file",
    response_class=Response,
    responses={
        200: {"description": "The stored bytes.", "content": {"application/octet-stream": {}}},
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing files.read or a pending password change."},
        404: {"description": "No such file belongs to the caller."},
        500: {"description": "The stored contents are missing or fail their checksum."},
    },
)
async def download_file(
    file_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.FILES_READ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """The bytes, verified against the digest the row records before they leave.

    A row whose object is gone, or whose object no longer hashes to what was
    recorded, is a **server** fault — the request was fine and the store is
    wrong. Answering 404 would report that as "you may not have this", which is
    both untrue and useless to whoever has to fix it.
    """
    asset = await _owned_or_404(session, context, file_id)
    try:
        data = await storage.read_file(asset)
    except (
        storage.ObjectNotFound,
        storage.StorageIntegrityError,
        storage.InvalidStorageKey,
    ) as broken:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The stored file could not be read.",
        ) from broken
    return Response(
        content=data,
        media_type=asset.content_type,
        headers={
            "Content-Disposition": content_disposition(asset.original_filename),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete(
    "/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a file",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing files.create or a pending password change."},
        404: {"description": "No such file belongs to the caller."},
    },
)
async def delete_file(
    file_id: uuid.UUID,
    context: Annotated[SessionContext, Depends(require_permission(PermissionCode.FILES_CREATE))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Delete a file and its bytes. The row and the audit event commit first;
    the object follows (see `storage.delete_file` for why that order)."""
    try:
        await storage.delete_file(
            session, actor=context.user, user_id=context.user.id, file_id=file_id
        )
    except storage.FileNotFound as missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found."
        ) from missing


async def _owned_or_404(
    session: AsyncSession, context: SessionContext, file_id: uuid.UUID
) -> FileAsset:
    """The caller's file, or the one 404 every endpoint here shares."""
    try:
        return await storage.load_file(session, user_id=context.user.id, file_id=file_id)
    except storage.FileNotFound as missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found."
        ) from missing
