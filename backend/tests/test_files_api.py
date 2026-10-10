"""The Files API: authorized upload, download and delete (F050).

The acceptance is "cross-user/file tests", which is one question asked of every
endpoint twice: *does the door want the right permission*, and *does the id in
the path reach anyone else's file?* The second question is asked from a second
account's client — same application, same table, different session — because
the answer has to come from the SQL predicate, not from a habit of comparing
owner ids in Python and hoping every route remembers to.

The rest follows from what a file endpoint has to get right: the type is what
the bytes are (a `.txt` full of PNG is a PNG), a refusal names the field the
user is looking at, a download is marked rather than merely typed, a row whose
object is gone is a *server* fault rather than a 404, and a commit that fails
leaves no object behind.

Everything runs against a temporary volume — the configured one is never
touched — and the real `file_assets` table, so the CHECK constraints and the
`uuidv7()` default are PostgreSQL's rather than a stand-in's.
"""

import hashlib
import itertools
import uuid
from pathlib import Path
from typing import Any

import httpx
import pytest
from conftest import ClientFactory
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1 import files as files_api
from app.core.config import get_settings
from app.core.cookies import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import AuditLog, FileAsset, Permission, Role, User
from app.services import storage
from app.services.storage import LocalVolumeStorage

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"
FILES_API = "/api/v1/files"

PNG = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89"
)
PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n"
EXE = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 32

_SEQUENCE = itertools.count(1)


# --------------------------------------------------------------------------
# Fixtures and helpers
# --------------------------------------------------------------------------


@pytest.fixture
def volume(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalVolumeStorage:
    """A private volume of this test's own, wired in as the configured one.

    `get_storage` is patched on the module rather than its cache cleared: the
    service resolves the name at call time, so both the endpoint and the
    producer under it reach this volume and nothing else.
    """
    volume = LocalVolumeStorage(tmp_path / "volume")
    monkeypatch.setattr(storage, "get_storage", lambda: volume)
    return volume


@pytest.fixture
def small_cap(monkeypatch: pytest.MonkeyPatch) -> int:
    """A 64-byte cap, so "too large" is a test-sized fact.

    Both readers of the setting are patched — the endpoint (which must stop
    reading) and the service (which re-checks) — so the test exercises the
    configured rule rather than a special case in one of them.
    """
    cap = 64
    settings = get_settings().model_copy(update={"storage_max_upload_bytes": cap})
    monkeypatch.setattr(files_api, "get_settings", lambda: settings)
    monkeypatch.setattr(storage, "get_settings", lambda: settings)
    return cap


def stored_objects(volume: LocalVolumeStorage) -> list[str]:
    if not volume.root.exists():
        return []
    return sorted(entry.name for entry in volume.root.iterdir() if entry.is_file())


async def count_assets(session: AsyncSession) -> int:
    return int(await session.scalar(select(func.count()).select_from(FileAsset)) or 0)


async def add_user(session: AsyncSession, email: str | None = None) -> User:
    user = User(
        email=email or f"ada{next(_SEQUENCE)}@example.com",
        full_name="Ada Lovelace",
        hashed_password=hash_password(PASSWORD),
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
    email: str | None = None,
    ip: str = "203.0.113.7",
) -> tuple[httpx.AsyncClient, User]:
    """A signed-in client holding exactly ``codes`` (the two session cookies and
    the CSRF header are lifted the way the other API tests lift them)."""
    user = await add_user(session, email)
    if codes:
        role = Role(name=f"files-role-{next(_SEQUENCE)}")
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
        json={"email": user.email, "password": PASSWORD},
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
    return client, user


async def upload(
    client: httpx.AsyncClient,
    *,
    data: bytes = PNG,
    filename: str = "logo.png",
    content_type: str = "image/png",
    category: str = "templates",
    extra: dict[str, str] | None = None,
) -> httpx.Response:
    return await client.post(
        FILES_API,
        files={"file": (filename, data, content_type)},
        data={"category": category, **(extra or {})},
    )


async def stored_asset(session: AsyncSession, item: dict[str, Any]) -> FileAsset:
    asset = await session.scalar(select(FileAsset).where(FileAsset.id == uuid.UUID(item["id"])))
    assert asset is not None
    return asset


BOTH_CODES = [PermissionCode.FILES_CREATE, PermissionCode.FILES_READ]


# --------------------------------------------------------------------------
# The door: a session, then the right code
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_an_anonymous_caller_reaches_nothing(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    anonymous = await make_client()

    assert (await anonymous.get(FILES_API)).status_code == 401
    assert (await anonymous.get(f"{FILES_API}/{uuid.uuid4()}")).status_code == 401
    assert (await anonymous.get(f"{FILES_API}/{uuid.uuid4()}/content")).status_code == 401
    assert (await anonymous.delete(f"{FILES_API}/{uuid.uuid4()}")).status_code == 401
    assert (await upload(anonymous)).status_code == 401


@pytest.mark.integration
async def test_the_read_side_and_the_write_side_are_separate_codes(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    """`viewer` holds files.read and not files.create; that is the whole split."""
    reader, _ = await sign_in(session, make_client, [PermissionCode.FILES_READ], ip="203.0.113.8")
    writer, _ = await sign_in(session, make_client, [PermissionCode.FILES_CREATE], ip="203.0.113.9")

    assert (await reader.get(FILES_API)).status_code == 200
    assert (await upload(reader)).status_code == 403

    created = await upload(writer)
    assert created.status_code == 201, created.text
    file_id = created.json()["id"]
    assert (await writer.get(FILES_API)).status_code == 403
    assert (await writer.get(f"{FILES_API}/{file_id}")).status_code == 403
    assert (await writer.get(f"{FILES_API}/{file_id}/content")).status_code == 403
    # Deleting one's own file is the write side, so this account may.
    assert (await writer.delete(f"{FILES_API}/{file_id}")).status_code == 204


@pytest.mark.integration
async def test_a_pending_password_change_outranks_the_file_browser(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    """The gated `current_session` (C30's rule): a forced change 403s everything
    that is not on the auth router's exemption list."""
    client, user = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.10")
    assert (await client.get(FILES_API)).status_code == 200

    user.must_change_password = True
    await session.commit()

    assert (await client.get(FILES_API)).status_code == 403
    assert (await upload(client)).status_code == 403


# --------------------------------------------------------------------------
# Upload: stored as what it is, owned by who sent it
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_an_upload_is_stored_as_what_its_bytes_are(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    client, user = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.11")

    # A PNG that claims to be a generic blob, under a name that claims to be
    # text. Neither the name nor the claim is consulted for the stored type.
    response = await upload(client, filename="holiday.txt", content_type="application/octet-stream")

    assert response.status_code == 201, response.text
    item = response.json()
    assert item["content_type"] == "image/png"  # the bytes decided, not the name
    assert item["original_filename"] == "holiday.txt"
    assert item["size"] == len(PNG)
    assert item["sha256"] == hashlib.sha256(PNG).hexdigest()
    assert item["category"] == "templates"

    asset = await stored_asset(session, item)
    assert asset.owner_user_id == user.id
    # The object is in the volume, named by its key — never by the row id.
    assert stored_objects(volume) == [asset.key]
    assert asset.key != item["id"]

    event = await session.scalar(select(AuditLog).where(AuditLog.action == "file.create"))
    assert event is not None
    assert event.entity_type == "file"
    assert event.entity_id == asset.id
    assert event.user_id == user.id


@pytest.mark.integration
async def test_the_wire_never_carries_the_object_name(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    """The storage key is how this application addresses the bytes; a client
    gets an id and asks the API. So the item has no key field at all."""
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.12")

    item = (await upload(client)).json()

    assert set(item) == {
        "id",
        "original_filename",
        "content_type",
        "size",
        "sha256",
        "category",
        "created_at",
    }


@pytest.mark.integration
async def test_an_upload_cannot_name_its_owner(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    """Ownership comes from the session. A body that tries to hand the file to
    somebody else is ignored, not honoured."""
    client, owner = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.13")
    _, other = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.14")

    response = await upload(client, extra={"owner_user_id": str(other.id)})

    assert response.status_code == 201, response.text
    asset = await stored_asset(session, response.json())
    assert asset.owner_user_id == owner.id


@pytest.mark.integration
async def test_an_upload_is_refused_with_the_field_it_belongs_to(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage, small_cap: int
) -> None:
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.15")

    def field(body: dict[str, Any]) -> list[str]:
        (entry,) = body["detail"]
        return list(entry["loc"])

    oversized = await upload(client, data=PNG + b"x" * small_cap)
    assert oversized.status_code == 422
    assert field(oversized.json()) == ["body", "file"]
    assert str(small_cap) in oversized.json()["detail"][0]["msg"]

    executable = await upload(client, data=EXE, filename="invoice.pdf")
    assert executable.status_code == 422
    assert field(executable.json()) == ["body", "file"]

    empty = await upload(client, data=b"")
    assert empty.status_code == 422
    assert field(empty.json()) == ["body", "file"]

    # The declared type cannot widen anything: a PNG is not a PDF however it
    # is labelled.
    mismatched = await upload(
        client, data=PNG, filename="statement.pdf", content_type="application/pdf"
    )
    assert mismatched.status_code == 422
    assert field(mismatched.json()) == ["body", "file"]

    # The one refusal that is about a request field rather than the bytes.
    bad_category = await upload(client, category="Templates!")
    assert bad_category.status_code == 422
    assert field(bad_category.json()) == ["body", "category"]

    # Nothing a refusal touched was stored.
    assert stored_objects(volume) == []
    assert await count_assets(session) == 0


@pytest.mark.integration
async def test_a_text_file_may_refine_its_own_type(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    """The one narrowing a client is allowed: text/plain is what the bytes
    prove, and a CSV is a claim inside that family."""
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.16")

    response = await upload(
        client,
        data=b"name,amount\nAda,1\n",
        filename="rates.csv",
        content_type="text/csv",
    )

    assert response.status_code == 201, response.text
    assert response.json()["content_type"] == "text/csv"


# --------------------------------------------------------------------------
# Cross-user: the id in the path reaches one account only
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_a_file_belongs_to_the_account_that_uploaded_it(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    owner_client, _ = await sign_in(
        session, make_client, BOTH_CODES, email="owner@example.com", ip="203.0.113.17"
    )
    other_client, _ = await sign_in(
        session, make_client, BOTH_CODES, email="other@example.com", ip="203.0.113.18"
    )
    item = (await upload(owner_client)).json()

    # Not found, never forbidden: a 403 would confirm that the id exists.
    assert (await other_client.get(f"{FILES_API}/{item['id']}")).status_code == 404
    assert (await other_client.get(f"{FILES_API}/{item['id']}/content")).status_code == 404
    assert (await other_client.delete(f"{FILES_API}/{item['id']}")).status_code == 404

    # An id that never existed is the same answer, which is the point.
    assert (await other_client.get(f"{FILES_API}/{uuid.uuid4()}")).status_code == 404

    # The other account's library is empty, and the owner's file survived the
    # refusals untouched.
    listed = (await other_client.get(FILES_API)).json()
    assert listed["total"] == 0
    assert listed["items"] == []
    assert (await owner_client.get(f"{FILES_API}/{item['id']}")).status_code == 200
    assert (await owner_client.get(f"{FILES_API}/{item['id']}/content")).content == PNG


# --------------------------------------------------------------------------
# Download: the bytes, verified, marked, and one account's own
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_a_download_serves_the_bytes_it_records(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.19")
    item = (await upload(client, filename="logo.png")).json()

    response = await client.get(f"{FILES_API}/{item['id']}/content")

    assert response.status_code == 200
    assert response.content == PNG
    assert response.headers["content-type"].startswith("image/png")


@pytest.mark.integration
async def test_a_download_is_marked_rather_than_merely_typed(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    """BP-6.4's "safe file response headers": the sniffed type, an attachment
    disposition, nosniff, and no caching of a private object."""
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.20")
    # A path a client might hope would become a directory, or a header.
    item = (
        await upload(
            client, data=PDF, filename="../../etc/report.pdf", content_type="application/pdf"
        )
    ).json()
    assert item["original_filename"] == "report.pdf"  # a display name, not a path

    response = await client.get(f"{FILES_API}/{item['id']}/content")

    assert response.status_code == 200
    # Exact, because "the header cannot be broken by a filename" is the claim:
    # the separators are gone before the name gets here.
    assert response.headers["content-disposition"] == (
        "attachment; filename=\"report.pdf\"; filename*=UTF-8''report.pdf"
    )
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "private, no-store"


async def test_the_disposition_helper_encodes_a_name_ascii_clients_cannot_read() -> None:
    """Two names, because no single one works everywhere."""
    disposition = files_api.content_disposition("تقرير المشروع.pdf")

    assert disposition.startswith('attachment; filename="')
    fallback, _, encoded = disposition.partition("filename*=UTF-8''")
    assert fallback.isascii()
    assert encoded == (
        "%D8%AA%D9%82%D8%B1%D9%8A%D8%B1%20%D8%A7%D9%84%D9%85%D8%B4%D8%B1%D9%88%D8%B9.pdf"
    )


async def test_the_disposition_helper_cannot_have_a_header_injected_into_it() -> None:
    """A name is a name, however it is spelled: the helper re-derives it rather
    than trusting the caller to have done so, and a CR/LF in a header value is
    an injected header."""
    disposition = files_api.content_disposition('report\r\n"final".pdf')

    assert "\r" not in disposition and "\n" not in disposition
    assert disposition == (
        "attachment; filename=\"reportfinal.pdf\"; filename*=UTF-8''reportfinal.pdf"
    )


@pytest.mark.integration
async def test_a_row_whose_object_is_gone_is_a_server_fault(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.21")
    item = (await upload(client)).json()
    asset = await stored_asset(session, item)

    await storage.remove_object(asset.key, backend=volume)

    response = await client.get(f"{FILES_API}/{item['id']}/content")
    assert response.status_code == 500


@pytest.mark.integration
async def test_a_swapped_object_fails_its_recorded_checksum(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.22")
    item = (await upload(client)).json()
    asset = await stored_asset(session, item)

    volume.object_path(asset.key).write_bytes(b"not the file that was checksummed")

    response = await client.get(f"{FILES_API}/{item['id']}/content")
    assert response.status_code == 500


# --------------------------------------------------------------------------
# Delete, and the one window a failed commit opens
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_deleting_removes_the_row_the_record_and_the_bytes(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    client, user = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.23")
    item = (await upload(client)).json()
    asset = await stored_asset(session, item)
    asset_id, key = asset.id, asset.key

    response = await client.delete(f"{FILES_API}/{item['id']}")

    assert response.status_code == 204
    assert await count_assets(session) == 0
    assert stored_objects(volume) == []  # the bytes go too, after the commit

    event = await session.scalar(select(AuditLog).where(AuditLog.action == "file.delete"))
    assert event is not None
    assert event.entity_id == asset_id
    assert event.user_id == user.id
    assert event.details == {"storage_key": key}

    # Deleting it again is a 404, not a second 204.
    assert (await client.delete(f"{FILES_API}/{item['id']}")).status_code == 404


@pytest.mark.integration
async def test_a_failed_commit_takes_the_object_back_out(
    session: AsyncSession,
    make_client: ClientFactory,
    volume: LocalVolumeStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The window F050 can close: the producer has written the object, the row
    will never be durable, so the object must not survive it."""
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.24")

    async def refuse_commit(self: AsyncSession) -> None:
        raise RuntimeError("commit refused")

    monkeypatch.setattr(AsyncSession, "commit", refuse_commit)

    with pytest.raises(RuntimeError):
        await upload(client)

    # The row was flushed and never became durable, so the object it names is
    # unreachable: the volume holds nothing.
    assert stored_objects(volume) == []


# --------------------------------------------------------------------------
# The library: paged, newest first, one account's own
# --------------------------------------------------------------------------


@pytest.mark.integration
async def test_the_list_is_paged_over_the_callers_own_files(
    session: AsyncSession, make_client: ClientFactory, volume: LocalVolumeStorage
) -> None:
    client, _ = await sign_in(session, make_client, BOTH_CODES, ip="203.0.113.25")
    uploads = [
        (
            await upload(client, data=PDF, filename=f"doc{n}.pdf", content_type="application/pdf")
        ).json()
        for n in range(3)
    ]

    first = (await client.get(FILES_API, params={"page_size": 2})).json()
    second = (await client.get(FILES_API, params={"page_size": 2, "page": 2})).json()

    assert first["total"] == second["total"] == 3
    assert len(first["items"]) == 2
    assert len(second["items"]) == 1
    served = [item["id"] for item in first["items"]] + [item["id"] for item in second["items"]]
    assert len(set(served)) == 3  # no row on two pages, none skipped
    assert set(served) == {item["id"] for item in uploads}

    # Same page, same order: files uploaded in one transaction share an
    # instant, so the id tiebreaker is what makes the order stable.
    again = (await client.get(FILES_API, params={"page_size": 2})).json()
    assert [item["id"] for item in again["items"]] == [item["id"] for item in first["items"]]

    assert (await client.get(FILES_API, params={"page_size": 101})).status_code == 422
    assert (await client.get(FILES_API, params={"page": 0})).status_code == 422
