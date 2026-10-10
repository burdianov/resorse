"""The conversion adapter (F052).

The acceptance is two words — "Healthy/unavailable tests" — and it is read as a
question about *behaviour under a service that is not there*: the converter is
the only external dependency this application may lose without losing itself, so
what is tested is that every way it can fail arrives as one of two answers, and
that neither of them is an unhandled exception or a plausibly-shaped lie.

No service is needed. ``httpx.MockTransport`` answers the requests, which means
the tests exercise the real client, the real multipart encoding and the real
response reading — everything except the socket. The live round trip is one
opt-in test at the end (``RESORS_LIVE_GOTENBERG=1``), because a test suite that
requires a container is a test suite nobody runs.
"""

import os

import httpx
import pytest

from app.core.config import get_settings
from app.services import conversion, reports
from app.services.conversion import ConversionRejected, ConversionUnavailable
from app.services.reports import ReportDocument, ReportSection

pytestmark = pytest.mark.asyncio

# A real PDF rather than a magic-byte stub: the assertions are then about a file
# a reader can open, which is the only thing a caller of this module wants.
PDF = reports.render_report(
    ReportDocument(title="Converted", sections=(ReportSection("Notes", ("Back from Word.",)),))
)
DOCX = reports.render_docx(ReportDocument(title="Source"))


def answering(
    status: int,
    body: bytes,
    *,
    content_type: str = "application/pdf",
) -> httpx.MockTransport:
    """A converter that answers every request the same way."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, content=body, headers={"content-type": content_type})

    return httpx.MockTransport(handler)


def failing(error: Exception) -> httpx.MockTransport:
    """A converter that is not there: the request dies in the transport."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    return httpx.MockTransport(handler)


def converter(
    transport: httpx.MockTransport,
    *,
    max_response_bytes: int = 4 * 1024 * 1024,
) -> conversion.GotenbergConverter:
    return conversion.GotenbergConverter(
        base_url="http://gotenberg:3000",
        timeout_seconds=1.0,
        max_response_bytes=max_response_bytes,
        transport=transport,
    )


# --------------------------------------------------------------------------
# The conversion itself
# --------------------------------------------------------------------------


async def test_a_docx_becomes_the_pdf_the_service_answered() -> None:
    """One request, on the route and field Gotenberg documents, and the bytes back."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=PDF, headers={"content-type": "application/pdf"})

    result = await converter(httpx.MockTransport(handler)).convert(
        DOCX,
        filename="report.docx",
    )

    assert result == PDF
    assert reports.count_pages(result) == reports.count_pages(PDF)
    request = seen[0]
    assert request.method == "POST"
    assert request.url.path == conversion.CONVERT_PATH
    assert request.headers["content-type"].startswith("multipart/form-data; boundary=")
    # The field name and the file name are Gotenberg's API, not ours, and the
    # name is not decoration: the route reads the input type from it.
    assert f'name="{conversion.UPLOAD_FIELD}"'.encode() in request.content
    assert b'filename="report.docx"' in request.content
    assert DOCX in request.content


async def test_convert_to_pdf_uses_the_converter_it_is_given() -> None:
    pdf = await conversion.convert_to_pdf(
        DOCX,
        filename="report.docx",
        converter=converter(answering(200, PDF)),
    )

    assert reports.count_pages(pdf) == reports.count_pages(PDF)


# --------------------------------------------------------------------------
# Unavailable: no answer, or "not right now"
# --------------------------------------------------------------------------


async def test_a_service_that_refuses_the_connection_is_unavailable() -> None:
    with pytest.raises(ConversionUnavailable):
        await converter(failing(httpx.ConnectError("connection refused"))).convert(
            DOCX,
            filename="report.docx",
        )


async def test_a_service_that_never_answers_is_unavailable() -> None:
    """A hang is not a failed conversion: the document was never the problem."""
    with pytest.raises(ConversionUnavailable):
        await converter(failing(httpx.ReadTimeout("timed out"))).convert(
            DOCX,
            filename="report.docx",
        )


async def test_a_service_that_is_starting_up_is_unavailable() -> None:
    """503 is what Gotenberg answers while its queue is saturated."""
    with pytest.raises(ConversionUnavailable) as refused:
        await converter(answering(503, b"Service Unavailable", content_type="text/plain")).convert(
            DOCX,
            filename="report.docx",
        )

    assert "503" in str(refused.value)


# --------------------------------------------------------------------------
# Rejected: an answer, and it is not a report
# --------------------------------------------------------------------------


async def test_a_refused_document_is_rejected() -> None:
    with pytest.raises(ConversionRejected) as refused:
        await converter(
            answering(400, b"invalid form data", content_type="text/plain"),
        ).convert(DOCX, filename="report.docx")

    assert "400" in str(refused.value)


async def test_an_error_page_is_rejected_rather_than_stored() -> None:
    """The case the check exists for: 200, and the body is HTML.

    Gotenberg answers some failed conversions with an error page under a success
    status. A caller that trusted the status would store it — and then serve it
    to a user as their report.
    """
    with pytest.raises(ConversionRejected) as refused:
        await converter(
            answering(
                200, b"<html><body>Conversion failed</body></html>", content_type="text/html"
            ),
        ).convert(DOCX, filename="report.docx")

    assert "not a PDF" in str(refused.value)


async def test_an_answer_past_the_cap_is_rejected() -> None:
    """The cap is on the response, and it is enforced while reading, not after."""
    oversized = b"%PDF-1.7\n" + b"\0" * 8192

    with pytest.raises(ConversionRejected) as refused:
        await converter(answering(200, oversized), max_response_bytes=1024).convert(
            DOCX,
            filename="report.docx",
        )

    assert "response cap" in str(refused.value)


async def test_a_document_that_is_empty_is_rejected_without_asking() -> None:
    """Refused here, not by the service: there is nothing to send."""
    with pytest.raises(ConversionRejected):
        await converter(failing(AssertionError("the service must not be asked"))).convert(
            b"",
            filename="report.docx",
        )


async def test_a_name_with_no_extension_is_rejected_without_asking() -> None:
    """Gotenberg reads the input type from the extension, so this cannot work."""
    with pytest.raises(ConversionRejected) as refused:
        await converter(failing(AssertionError("the service must not be asked"))).convert(
            DOCX,
            filename="report",
        )

    assert "extension" in str(refused.value)


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------


async def test_health_is_true_when_the_service_answers() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            content=b'{"status":"up"}',
            headers={"content-type": "application/json"},
        )

    assert await converter(httpx.MockTransport(handler)).health() is True
    assert seen[0].url.path == conversion.HEALTH_PATH


async def test_health_is_false_rather_than_raising_when_the_service_is_down() -> None:
    """A probe answers a boolean question; it does not invent an error path."""
    assert await converter(failing(httpx.ConnectError("connection refused"))).health() is False


async def test_health_is_false_on_a_status_that_is_not_ok() -> None:
    assert await converter(answering(500, b"boom", content_type="text/plain")).health() is False


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------


async def test_the_adapter_is_built_from_the_configured_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The cached accessor, and the one thing it must not have kept: a client.

    ``get_storage``'s lesson (F023): a cached singleton is reloaded by clearing
    the cache, and the test says so rather than hoping the environment was read
    at import time.
    """
    monkeypatch.setenv("GOTENBERG_URL", "http://converter.internal:3000/")
    get_settings.cache_clear()
    conversion.get_converter.cache_clear()
    try:
        assert conversion.get_converter().base_url == "http://converter.internal:3000"
    finally:
        conversion.get_converter.cache_clear()
        get_settings.cache_clear()


# --------------------------------------------------------------------------
# The one test that needs a service (opt-in)
# --------------------------------------------------------------------------


@pytest.mark.skipif(
    os.environ.get("RESORS_LIVE_GOTENBERG") != "1",
    reason="needs a running Gotenberg; start one and set RESORS_LIVE_GOTENBERG=1",
)
async def test_a_live_conversion_produces_a_readable_pdf() -> None:
    """The end-to-end check the mock cannot make: LibreOffice actually ran."""
    converter_live = conversion.get_converter()
    assert await converter_live.health() is True

    pdf = await converter_live.convert(DOCX, filename="report.docx")

    assert pdf.startswith(conversion.PDF_MAGIC)
    assert reports.count_pages(pdf) >= 1
