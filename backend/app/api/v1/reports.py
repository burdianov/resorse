"""Reports API (F053) — two endpoints over the report services.

| endpoint | what it answers |
|---|---|
| ``POST /reports/user-directory`` | the payer's own directory, rendered as a PDF |
| ``GET /reports/engine-health`` | whether the report engine can do its work right now |

**Two permission codes on one route, and it is not redundancy.** The export
demands ``reports.generate`` (it *is* a report) and ``users.read`` (it *is* the
directory): a caller holding only the first would otherwise export rows they may
not list. Laying two ``require_permission`` dependencies is the shape
``dependencies.py`` documents for exactly this case, and between them and
``exports.user_directory_document``'s shared predicate the export cannot see
more than the directory screen does.

**The renderer runs in a worker thread.** ``reports.render_report`` is
synchronous and CPU-bound (ReportLab builds the whole document in memory), so
the route hands it to ``run_in_threadpool`` rather than blocking the event loop
for the length of a render — the hand-off the engine's docstring defers to this
task.

**What leaves is marked, not merely typed** — the same three headers the file
library sets on a download (F050), for the same reason: a document served by an
API should arrive as an attachment, un-sniffed and un-cached. The header itself
is built by ``files.content_disposition`` rather than rewritten here; it already
sanitises the name, and a second implementation is how a CR/LF eventually
reaches a header value.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.v1.dependencies import require_permission
from app.api.v1.files import content_disposition
from app.core.database import get_session
from app.core.permissions import PermissionCode
from app.schemas.reports import EngineHealthResponse, UserDirectoryReportRequest
from app.services import conversion, exports, reports
from app.services.sessions import SessionContext

router = APIRouter(prefix="/reports")


class PdfResponse(Response):
    """A response whose media type is a PDF — and says so in OpenAPI.

    A bare ``Response`` in FastAPI's schema is ``application/json`` by default,
    which would make the generated client lie about what it receives. This
    subclass carries the type, so the contract is declared once and the route
    body stays about the document.
    """

    media_type = "application/pdf"


DIRECTORY_ERRORS = (exports.TooManyRows,)


def _to_http(exc: Exception) -> HTTPException:
    """The route's translation table: a builder refusal → its status.

    ``TooManyRows`` is a **409**, not a 422: nothing about the request is
    malformed — the filters are valid and the directory is simply larger than
    one document may carry, which is a rule about stored state (the same shape
    as the last-super-admin refusal in the directory API). The message names the
    limit and the way out.
    """
    if isinstance(exc, exports.TooManyRows):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    raise exc


@router.post(
    "/user-directory",
    response_class=PdfResponse,
    summary="Export the user directory as a PDF",
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "The directory, rendered as a PDF attachment.",
        },
        401: {"description": "No usable session was presented."},
        403: {
            "description": (
                "Missing reports.generate, missing users.read, or a pending password change."
            )
        },
        409: {"description": "The export would exceed the row limit for one document."},
        422: {"description": "Shape errors in the filter body."},
    },
)
async def user_directory_report(
    payload: UserDirectoryReportRequest,
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.REPORTS_GENERATE))
    ],
    # The data gate. Unused by the body on purpose: the dependency *is* the
    # check, and the rows it authorises arrive through the shared predicate
    # (see the module docstring).
    _directory_access: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.USERS_READ))
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Render the caller's directory with the filters they are looking at.

    The document carries exactly the columns the directory screen shows, in its
    order, and the same predicate decides the rows — so "what I saw" and "what I
    downloaded" are one answer rather than two that agree today.
    """
    generated_at = datetime.now(UTC)
    try:
        document = await exports.user_directory_document(
            session,
            search=payload.search,
            is_active=payload.is_active,
            sort=payload.sort,
            order=payload.order,
            generated_by=context.user.full_name,
            generated_at=generated_at,
        )
    except DIRECTORY_ERRORS as exc:
        raise _to_http(exc) from exc

    pdf = await run_in_threadpool(reports.render_report, document)
    return PdfResponse(
        content=pdf,
        headers={
            "Content-Disposition": content_disposition(
                f"user-directory-{generated_at:%Y-%m-%d}.pdf"
            ),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.get(
    "/engine-health",
    response_model=EngineHealthResponse,
    summary="Report engine health",
    responses={
        401: {"description": "No usable session was presented."},
        403: {"description": "Missing the reports.generate permission."},
    },
)
async def engine_health(
    context: Annotated[
        SessionContext, Depends(require_permission(PermissionCode.REPORTS_GENERATE))
    ],
) -> EngineHealthResponse:
    """Whether reports can be produced, and whether DOCX conversion can.

    Gated on ``reports.generate`` rather than being public: it is a diagnostic
    for the capability it describes, and it reports availability without naming
    an internal address or a version (an error body is not the place to narrate
    the deployment). PostgreSQL is deliberately *not* probed here — that is the
    readiness endpoint's question (BP-8.4b, F062), and this route needs no
    database session at all.
    """
    # The renderer is CPU-bound here too, and a health route is not the place
    # to block the event loop.
    pdf_engine = await run_in_threadpool(reports.self_test)
    converter = await conversion.health()
    return EngineHealthResponse(
        status="ok" if pdf_engine and converter else "degraded",
        pdf_engine=pdf_engine,
        converter=converter,
    )
