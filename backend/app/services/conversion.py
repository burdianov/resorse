"""Converting documents with Gotenberg (F052, BP-7.9b).

One operation and a probe, and **no route**: F053 owns the endpoint that calls
this and the preview that shows what came back. What lives here is the part a
caller should not re-implement — how this application talks to the one external
service in the stack.

**Why a service at all.** Converting a Word file to a PDF faithfully means
running an office suite, and running an office suite over documents this
application generated or stored means running it *somewhere else*: Gotenberg
holds LibreOffice inside its own container, on the internal network, with no
published port in production (ARCHITECTURE §1–§2). Nothing here parses the
format itself, and nothing hands a document to a subprocess of this process.

**Why it is not a dependency like PostgreSQL.** The database is required for the
application to mean anything; the converter is required for one operation. So a
converter that is down is a *refusal* the caller handles, never a failure to
start — :meth:`GotenbergConverter.health` answers that question as a boolean, so
a readiness probe can report it without inventing a second error path.

**Two ways this fails, and they are different.** :class:`ConversionUnavailable`
is "no answer, or the answer was 'I cannot serve right now'": a connection that
refused, a timeout, a 5xx. The next move is to try again later, and a probe
should call the service down. :class:`ConversionRejected` is "this document will
not become a PDF here": a 4xx, an empty document, a filename with no extension
for the route to read, a response larger than the cap, or — the one worth naming
— a **200 whose body is not a PDF**. That last case is why the answer is checked
rather than trusted: Gotenberg returns an error *page* for some failed
conversions, and a caller handed `text/html` in a PDF-shaped variable would
store it and serve it as a report.
"""

from functools import lru_cache

import httpx

from app.core.config import Settings, get_settings
from app.services.reports import DOCX_CONTENT_TYPE

# Gotenberg's own API, not ours: the route that runs a LibreOffice conversion,
# the multipart field it reads inputs from, and the liveness route its image is
# health-checked with (docker-compose.yml). If these change, the version pin
# moves with them.
CONVERT_PATH = "/forms/libreoffice/convert"
HEALTH_PATH = "/health"
UPLOAD_FIELD = "files"

# A PDF starts with these five bytes and nothing else does — the same signature
# the file library sniffs (F049). Cheap, and it is the difference between a
# report and an error page.
PDF_MAGIC = b"%PDF-"


class ConversionError(Exception):
    """Base class for every refusal this module makes."""


class ConversionUnavailable(ConversionError):
    """The converter could not be reached, or is not serving right now.

    Connection failures, timeouts and 5xx answers are one situation from here:
    nothing about the document is wrong, and asking again later may work. A
    health probe reports this case as *down*.
    """


class ConversionRejected(ConversionError):
    """The converter answered, and this document is not a PDF because of it.

    A 4xx, a document that cannot be sent at all (empty), a name with no
    extension for the route to read, a response past the size cap, or a 200
    carrying something that is not a PDF. Retrying the same bytes will not help,
    and the message says which of these it was.
    """


class GotenbergConverter:
    """This stack's only document converter: an HTTP client for Gotenberg.

    Deliberately not behind a Protocol. The storage adapter has one because
    BP-7.9a asks for a future S3 backend; nothing asks for a second converter,
    and the second implementation would be a second office-compatible service
    with its own semantics. The seam that matters for tests is the transport,
    which is injectable — ``httpx.MockTransport`` answers without a service, and
    the live round trip is one opt-in test.
    """

    def __init__(
        self,
        *,
        base_url: str,
        timeout_seconds: float,
        max_response_bytes: int,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        # Stored without a trailing slash so a route path can be appended as
        # written; httpx resolves a leading-slash path against the host either
        # way, but two spellings of the same base URL is how a double slash
        # appears in a log.
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._max_response_bytes = max_response_bytes
        self._transport = transport

    @property
    def base_url(self) -> str:
        return self._base_url

    async def health(self) -> bool:
        """Whether the converter is answering, as a fact rather than a raise.

        Readiness is a boolean question, and a probe that raises makes every
        caller write the same ``try/except``. The body is not read: the status
        line is the whole answer, and not consuming it keeps a broken service
        from streaming anything into this process.
        """
        try:
            async with self._client() as client, client.stream("GET", HEALTH_PATH) as response:
                return response.status_code == httpx.codes.OK
        except httpx.HTTPError:
            return False

    async def convert(
        self,
        document: bytes,
        *,
        filename: str,
        content_type: str = DOCX_CONTENT_TYPE,
    ) -> bytes:
        """Convert ``document`` to PDF bytes, or raise.

        ``filename`` is not decoration: Gotenberg decides how to read an input
        from its **extension**, so a name without one cannot be converted and is
        refused here rather than sent to be refused there.
        """
        if not document:
            raise ConversionRejected("There is nothing to convert: the document is empty.")
        if not _suffix(filename):
            raise ConversionRejected(
                f"The converter reads the input type from the filename's extension, "
                f"and {filename!r} has none.",
            )
        try:
            async with (
                self._client() as client,
                client.stream(
                    "POST",
                    CONVERT_PATH,
                    files={UPLOAD_FIELD: (filename, document, content_type)},
                ) as response,
            ):
                self._refuse(response.status_code)
                body = await self._bounded(response)
        except httpx.HTTPError as unreachable:
            raise ConversionUnavailable(
                f"Gotenberg at {self._base_url} could not be reached: {unreachable}",
            ) from unreachable
        if not body.startswith(PDF_MAGIC):
            raise ConversionRejected(
                "Gotenberg answered 200 with something that is not a PDF "
                f"(Content-Type {response.headers.get('content-type', 'unset')!r}); "
                "an error page is not a report.",
            )
        return body

    def _client(self) -> httpx.AsyncClient:
        """A client for one operation, closed when it ends.

        Not one per process: a conversion is seconds of another service's work,
        so a pool saves nothing measurable, and a client that outlives a request
        would have to be closed by whoever owns the application's lifetime — an
        ``lru_cache``d client with no owner is how a connection pool becomes a
        resource warning at shutdown.
        """
        return httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            transport=self._transport,
        )

    @staticmethod
    def _refuse(status: int) -> None:
        """Turn a non-200 answer into the refusal that matches it."""
        if status == httpx.codes.OK:
            return
        if status >= httpx.codes.INTERNAL_SERVER_ERROR:
            raise ConversionUnavailable(
                f"Gotenberg answered {status}: the service is not able to convert right now.",
            )
        raise ConversionRejected(
            f"Gotenberg refused the document with {status}.",
        )

    async def _bounded(self, response: httpx.Response) -> bytes:
        """The response body, refusing to buffer more than the configured cap.

        Read in chunks rather than with ``aread()`` for the same reason an
        upload is read with a limit (F050): a cap enforced after the whole body
        is in memory only protects the caller from the *next* request.
        """
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > self._max_response_bytes:
                raise ConversionRejected(
                    f"The converted document exceeds the {self._max_response_bytes} byte "
                    "response cap; the conversion is not the one that was asked for.",
                )
        return bytes(body)


def _suffix(filename: str) -> str:
    """``filename``'s extension, lowercased and without the dot ("" if none).

    ``rpartition`` returns ``("", "", the_whole_string)`` when the separator is
    absent, so the dot itself has to be checked: testing the third element alone
    reports a suffix for ``report`` and then sends a file the route cannot read.
    """
    name, dot, extension = filename.rpartition(".")
    return extension.lower() if dot and name else ""


@lru_cache
def get_converter() -> GotenbergConverter:
    """The configured converter, created once per process.

    Cached because the endpoint is configuration, and created without a client
    for the same reason: a test that changes the setting calls
    ``get_converter.cache_clear()``, exactly as ``get_storage`` is reloaded
    (F023's lesson about cached singletons and the environment).
    """
    settings: Settings = get_settings()
    return GotenbergConverter(
        base_url=settings.gotenberg_url,
        timeout_seconds=settings.gotenberg_timeout_seconds,
        max_response_bytes=settings.gotenberg_max_response_bytes,
    )


async def convert_to_pdf(
    document: bytes,
    *,
    filename: str,
    content_type: str = DOCX_CONTENT_TYPE,
    converter: GotenbergConverter | None = None,
) -> bytes:
    """Convert ``document`` to PDF bytes through the configured converter.

    The entry point a route calls, and the same shape the storage service uses:
    the default comes from configuration, and a caller — a test — may pass its
    own.
    """
    return await (converter or get_converter()).convert(
        document,
        filename=filename,
        content_type=content_type,
    )


async def health(*, converter: GotenbergConverter | None = None) -> bool:
    """Whether the configured converter is answering — the probe a route calls.

    The same shape as :func:`convert_to_pdf` for the same reason: the default
    comes from configuration, and a test may pass its own. This is the entry
    point the reports health route reads (F053) and the one the readiness probe
    reads rather than reaching for the adapter itself (``app/api/v1/readiness.py``,
    F065) — where a converter that is down is *degraded*, not a failure.
    """
    return await (converter or get_converter()).health()
