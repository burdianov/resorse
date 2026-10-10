"""The reports API: an authorized, data-scoped PDF (F053).

The acceptance is two words — "**Valid data-scoped PDF test**" — and it is taken
as two questions asked of the same response:

- *Valid* — the bytes are a PDF a reader can open, which is checked by reading
  them back with pypdf (the library every consumer here uses) and by pulling the
  **words** out of the rendered pages. The built-in fonts are chosen to stay
  extractable (C39), so the assertions can be about what the report *says*
  rather than about its size.
- *Data-scoped* — the document contains the rows the caller may see and no
  others, under the filters they asked for. The rows are created in the test
  database and the export is compared against them, because the claim under
  test is precisely that the report and the directory screen read the same
  predicate (``users.directory_criteria``).

Everything runs through the real application over httpx's ASGI transport against
real PostgreSQL, so the authorization is the server's own — a session cookie, a
CSRF header, and the two permission codes the route demands.
"""

import io
import itertools
from datetime import UTC, datetime

import httpx
import pytest
from conftest import ClientFactory
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import Permission, Role, User
from app.services import conversion, exports, reports
from app.services import users as users_service

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"
REPORTS_API = "/api/v1/reports"
DIRECTORY_API = f"{REPORTS_API}/user-directory"
ENGINE_HEALTH_API = f"{REPORTS_API}/engine-health"

# What the route's own guards demand, as the two codes the acceptance is about.
GENERATE = PermissionCode.REPORTS_GENERATE
READ = PermissionCode.USERS_READ

_SEQUENCE = itertools.count(1)


# --------------------------------------------------------------------------
# Fixtures and helpers
# --------------------------------------------------------------------------


def text_of(pdf: bytes) -> str:
    """Every word the document says, page by page.

    This is the assertion surface for the data-scoping tests: a name in the
    rendered text is a row the report actually drew, which is a stronger claim
    than "the row count matched".
    """
    reader = PdfReader(io.BytesIO(pdf))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


async def add_account(
    session: AsyncSession,
    *,
    full_name: str,
    email: str | None = None,
    is_active: bool = True,
    is_deleted: bool = False,
) -> User:
    """An account in the directory, with no roles of its own.

    ``roles=[]`` rather than nothing: the constructor then *initialises* the
    collection, so a caller may append to it without a lazy load on a
    persistent instance, which would be IO outside a greenlet.
    """
    user = User(
        email=email or f"account{next(_SEQUENCE)}@example.com",
        full_name=full_name,
        hashed_password=hash_password(PASSWORD),
        is_active=is_active,
        is_deleted=is_deleted,
        roles=[],
    )
    session.add(user)
    await session.flush()
    return user


async def sign_in(
    session: AsyncSession,
    make_client: ClientFactory,
    codes: list[PermissionCode],
    *,
    ip: str = "203.0.113.7",
    must_change_password: bool = False,
) -> httpx.AsyncClient:
    """A signed-in client holding exactly ``codes``.

    The two session cookies and the CSRF header are lifted exactly the way the
    other API tests lift them (F029's double-submit applies to the POST), so the
    request path under test is the real one.
    """
    email = f"operator{next(_SEQUENCE)}@example.com"
    user = await add_account(session, full_name=f"Operator {next(_SEQUENCE)}", email=email)
    user.must_change_password = must_change_password
    if codes:
        role = Role(name=f"reports-role-{next(_SEQUENCE)}")
        session.add(role)
        with session.no_autoflush:
            for code in codes:
                permission = await session.scalar(select(Permission).where(Permission.code == code))
                if permission is None:
                    permission = Permission(code=code)
                    session.add(permission)
                role.permissions.append(permission)
        user.roles.append(role)
    await session.commit()

    client = await make_client(ip)
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200, response.text
    session_cookie = next(
        header
        for header in response.headers.get_list("set-cookie")
        if header.startswith(f"{SESSION_COOKIE_NAME}=")
    )
    csrf = (
        next(
            header
            for header in response.headers.get_list("set-cookie")
            if header.startswith(f"{CSRF_COOKIE_NAME}=")
        )
        .split("=", 1)[1]
        .split(";", 1)[0]
    )
    client.cookies.clear()
    client.cookies.update(
        {
            SESSION_COOKIE_NAME: session_cookie.split("=", 1)[1].split(";", 1)[0],
            CSRF_COOKIE_NAME: csrf,
        }
    )
    client.headers[CSRF_HEADER_NAME] = csrf
    return client


def converter(transport: httpx.MockTransport) -> conversion.GotenbergConverter:
    """A converter that answers through the given transport, as F052 tests it."""
    return conversion.GotenbergConverter(
        base_url="http://gotenberg:3000",
        timeout_seconds=1.0,
        max_response_bytes=4 * 1024 * 1024,
        transport=transport,
    )


def answering(status: int, body: bytes = b"") -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, content=body)

    return httpx.MockTransport(handler)


# --------------------------------------------------------------------------
# The door: a session, then both codes
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_an_anonymous_caller_reaches_neither_endpoint(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    anonymous = await make_client()

    assert (await anonymous.post(DIRECTORY_API, json={})).status_code == 401
    assert (await anonymous.get(ENGINE_HEALTH_API)).status_code == 401


@pytest.mark.integration
async def test_the_export_needs_reports_generate(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    reader = await sign_in(session, make_client, [READ], ip="203.0.113.8")

    assert (await reader.post(DIRECTORY_API, json={})).status_code == 403


@pytest.mark.integration
async def test_the_export_needs_the_directory_code_as_well(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    """The code the report engine's permission does *not* imply.

    A caller who may generate reports is not therefore a caller who may read the
    directory: without ``users.read`` the answer is a refusal, not an export and
    not an empty document.
    """
    generator = await sign_in(session, make_client, [GENERATE], ip="203.0.113.9")

    refused = await generator.post(DIRECTORY_API, json={})

    assert refused.status_code == 403


@pytest.mark.integration
async def test_a_pending_password_change_outranks_the_report(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    user = await add_account(session, full_name="Pending Change")
    await session.commit()
    client = await sign_in(
        session,
        make_client,
        [GENERATE, READ],
        ip="203.0.113.10",
        must_change_password=True,
    )

    response = await client.post(DIRECTORY_API, json={})

    assert response.status_code == 403
    assert "password must be changed" in response.json()["detail"]
    assert user.full_name not in response.text


# --------------------------------------------------------------------------
# The document: valid, and scoped to what the caller may see
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_the_export_is_a_readable_pdf_drawn_from_the_directory(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    """The acceptance, asked once in full: bytes, rows, and the marked headers.

    One client holding both codes asks for the unfiltered directory, and the
    answer is compared against the rows the test itself created (plus the
    operator's own account, which is a directory row like any other).
    """
    ada = await add_account(session, full_name="Ada Lovelace", email="ada@example.com")
    grace = await add_account(session, full_name="Grace Hopper", email="grace@example.com")
    gone = await add_account(
        session,
        full_name="Deleted Person",
        email="deleted@example.com",
        is_deleted=True,
    )
    await session.commit()
    client = await sign_in(session, make_client, [GENERATE, READ])

    response = await client.post(DIRECTORY_API, json={})

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    assert response.headers["content-disposition"].startswith("attachment;")
    assert "user-directory-" in response.headers["content-disposition"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "private, no-store"

    # Read back the way a consumer would, then read the words.
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) >= 1
    body = text_of(response.content)
    assert "User Directory" in body
    # The columns are the directory screen's, in its order.
    for column in exports.COLUMNS:
        assert column in body
    assert ada.full_name in body
    assert grace.email in body
    # The soft-deleted account is audit material, not a directory entry (F024).
    assert gone.full_name not in body
    assert gone.email not in body

    # The PDF says who produced it, which is the caller's name.
    metadata = reader.metadata
    assert metadata is not None
    assert metadata.author is not None
    assert metadata.title == "User Directory"


@pytest.mark.integration
async def test_the_export_draws_only_the_rows_the_filters_select(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    """The scope is the request's, not the caller's habit of asking for everything."""
    active = await add_account(session, full_name="Active Account", email="active@example.com")
    inactive = await add_account(
        session,
        full_name="Inactive Account",
        email="inactive@example.com",
        is_active=False,
    )
    await session.commit()
    client = await sign_in(session, make_client, [GENERATE, READ], ip="203.0.113.11")

    everyone = text_of((await client.post(DIRECTORY_API, json={})).content)
    only_inactive = text_of((await client.post(DIRECTORY_API, json={"is_active": False})).content)
    searched = text_of(
        (await client.post(DIRECTORY_API, json={"search": "inactive@example.com"})).content
    )

    assert active.full_name in everyone
    assert inactive.full_name in everyone

    assert inactive.full_name in only_inactive
    assert active.full_name not in only_inactive

    assert inactive.email in searched
    assert active.full_name not in searched


@pytest.mark.integration
async def test_a_search_that_matches_nothing_is_a_report_that_says_so(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    """A header row alone looks like a table whose rows failed to print."""
    await add_account(session, full_name="Someone Else")
    await session.commit()
    client = await sign_in(session, make_client, [GENERATE, READ], ip="203.0.113.12")

    response = await client.post(DIRECTORY_API, json={"search": "no-such-account-anywhere"})

    body = text_of(response.content)
    assert response.status_code == 200
    assert "No account matches these filters." in body


@pytest.mark.integration
async def test_a_report_past_the_row_cap_is_refused_rather_than_truncated(
    session: AsyncSession, make_client: ClientFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A document that stops early is a lie; the refusal names the limit.

    The cap is lowered rather than filled: a thousand accounts is a slow way to
    prove a constant, and ``limit`` is read at call time for exactly this.
    """
    monkeypatch.setattr(exports, "MAX_DIRECTORY_ROWS", 1)
    await add_account(session, full_name="First Account")
    await add_account(session, full_name="Second Account")
    await session.commit()
    client = await sign_in(session, make_client, [GENERATE, READ], ip="203.0.113.13")

    response = await client.post(DIRECTORY_API, json={})

    assert response.status_code == 409
    assert "more than 1 account" in response.json()["detail"]


@pytest.mark.integration
async def test_the_document_is_built_from_the_shared_directory_predicate(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    """The builder and the paged list must not be able to disagree.

    Asked directly rather than through the API: the list endpoint is F033's
    surface, and what F053 added is the *reader* both surfaces use.
    """
    first = await add_account(session, full_name="Aardvark Person", email="a@example.com")
    second = await add_account(session, full_name="Zebra Person", email="z@example.com")
    await add_account(session, full_name="Hidden Person", is_deleted=True)
    await session.commit()

    rows = await users_service.directory_rows(
        session,
        search=None,
        is_active=None,
        sort="full_name",
        order="asc",
        limit=50,
    )
    names = [row.full_name for row in rows]

    assert names.index(first.full_name) < names.index(second.full_name)
    assert "Hidden Person" not in names


# --------------------------------------------------------------------------
# Engine health
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_engine_health_needs_reports_generate(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    reader = await sign_in(session, make_client, [READ], ip="203.0.113.14")

    assert (await reader.get(ENGINE_HEALTH_API)).status_code == 403


@pytest.mark.integration
async def test_engine_health_reports_both_halves(
    session: AsyncSession, make_client: ClientFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One body, two facts — and the converter is the one that can be down."""
    client = await sign_in(session, make_client, [GENERATE, READ], ip="203.0.113.15")
    monkeypatch.setattr(conversion, "get_converter", lambda: converter(answering(200, b"{}")))

    healthy = await client.get(ENGINE_HEALTH_API)

    assert healthy.status_code == 200, healthy.text
    assert healthy.json() == {"status": "ok", "pdf_engine": True, "converter": True}


@pytest.mark.integration
async def test_engine_health_is_degraded_when_the_converter_is_down(
    session: AsyncSession, make_client: ClientFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = await sign_in(session, make_client, [GENERATE, READ], ip="203.0.113.16")
    monkeypatch.setattr(conversion, "get_converter", lambda: converter(answering(503)))

    degraded = await client.get(ENGINE_HEALTH_API)

    assert degraded.status_code == 200
    # The PDF half is unaffected: a converter that is down does not stop the
    # directory report, and the body says so rather than flattening both into
    # one failure.
    assert degraded.json() == {"status": "degraded", "pdf_engine": True, "converter": False}


async def test_the_health_route_probes_the_engine_rather_than_trusting_an_import(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The self-test renders a document and reads it back, so it *can* fail.

    A check that could only ever answer "true" would be decoration — this one
    answers "false" the moment the rendering path stops producing something
    pypdf can read, which is the failure a report endpoint would actually have.
    """
    assert reports.self_test() is True
    monkeypatch.setattr(reports, "render_report", lambda document: b"not a pdf")
    assert reports.self_test() is False


@pytest.mark.integration
async def test_the_report_names_the_moment_it_was_generated(
    session: AsyncSession, make_client: ClientFactory
) -> None:
    """The footer, the metadata and the file name carry the same instant."""
    await add_account(session, full_name="Ada Lovelace")
    await session.commit()
    client = await sign_in(session, make_client, [GENERATE, READ], ip="203.0.113.17")

    response = await client.post(DIRECTORY_API, json={})

    stamp = datetime.now(UTC).strftime("%Y-%m-%d")
    assert f"user-directory-{stamp}.pdf" in response.headers["content-disposition"]
    assert stamp in text_of(response.content)
