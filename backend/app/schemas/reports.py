"""Report request and health shapes (F053).

The request is the *directory filters*, not a report specification: the caller
sends what the screen is showing (F034's request parameters, same names, same
bounds) and the server decides the document. That is deliberate — a caller that
could name columns, layout or headings would be building reports, and BP-7.9c
asks for one permission-protected sample, not a report builder.

The response of the export is bytes, not a schema: a PDF is a media type, so
the route declares ``application/pdf`` in its OpenAPI responses rather than
wrapping a file in JSON (which would either balloon a base64 payload or describe
a size the caller has not asked for yet).
"""

from typing import Literal

from pydantic import BaseModel, Field

# The directory's own bounds (F033's query parameters), repeated as literals so
# a report cannot filter on something the list cannot show.
MAX_SEARCH_LENGTH = 100
SortField = Literal["full_name", "email", "created_at", "last_login_at"]
SortOrder = Literal["asc", "desc"]


class UserDirectoryReportRequest(BaseModel):
    """The filters the user directory is currently showing."""

    search: str | None = Field(default=None, max_length=MAX_SEARCH_LENGTH)
    is_active: bool | None = None
    sort: SortField = "created_at"
    order: SortOrder = "desc"


class EngineHealthResponse(BaseModel):
    """What the report engine can do right now.

    Two separate facts rather than one verdict, because they fail separately:
    the PDF engine is in this process and the converter is another service, and
    a caller that only needs a rendered PDF (the user directory) is not
    affected by a converter that is down. ``status`` is the headline a reader
    or a dashboard reads — ``degraded`` means at least one of them is not
    available.
    """

    status: Literal["ok", "degraded"]
    pdf_engine: bool
    converter: bool
