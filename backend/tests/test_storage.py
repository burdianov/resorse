"""The private storage core: traversal and MIME (F049).

The acceptance is "traversal and MIME tests", and the two are one question
asked twice — *what does the application believe about a file, and who decides?*

- **Traversal: the client does not.** Nothing a request sends may name a place
  on disk. The tests probe that from both ends: keys that spell a path are
  refused by the resolver (including the near-misses — an over-long UUID, an
  uppercase one, a valid one with a newline appended, which is why the pattern
  is matched with `fullmatch` and not `match`), and the name a client *does*
  send is reduced to a display name that never reaches the filesystem. The
  object on disk is named by its key, which is the assertion that matters:
  the two are different values, and only one of them is a path.
- **MIME: the bytes do.** The stored type is what the sniffer established; a
  declared type may narrow one case and widen nothing. An executable called
  `statement.pdf` is neither stored nor recorded as a PDF.

The last groups ask the questions the acceptance implies rather than spells out
— the size cap, the allowlist, the scan hook, the digest on read, and the audit
event that makes a stored file a fact rather than a row (F043's discipline: the
service adds it to the caller's transaction and never commits).

Everything runs against a temporary volume and the real `file_assets` table —
the CHECK constraints, the vocabulary change in revision 0009 and the
`uuidv7()` default are PostgreSQL's, and a stand-in would prove nothing.
"""

import hashlib
import io
import itertools
import os
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import AuditLog, FileAsset, User
from app.services import storage
from app.services.storage import LocalVolumeStorage

pytestmark = pytest.mark.asyncio

PASSWORD = "correct horse battery staple"


# --------------------------------------------------------------------------
# Payloads. Signatures are built here rather than read from disk, so each test
# states the bytes it is talking about.
# --------------------------------------------------------------------------

PNG = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89"
)
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01" + b"\x00" * 8
PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n"
CSV = b"name,amount\nAda,1\nGrace,2\n"
TEXT_WITH_BOM = b"\xef\xbb\xbfplain notes\n"
UNICODE_TEXT = "تقرير المشروع\n".encode()
HTML = b"<!doctype html><html><body>hi</body></html>"
SVG = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'
EXE = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 32
ELF = b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 32
GZIP = b"\x1f\x8b\x08\x00" + b"\x00" * 8
UTF16_TEXT = "hello".encode("utf-16-le")
INVALID_UTF8 = b"\x80\x81\x82\x83"


def archive(*entries: str) -> bytes:
    """A zip holding exactly these member names (contents are irrelevant)."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zip_file:
        for entry in entries:
            zip_file.writestr(entry, "<x/>")
    return buffer.getvalue()


DOCX = archive("[Content_Types].xml", "word/document.xml")
XLSX = archive("[Content_Types].xml", "xl/workbook.xml")
PLAIN_ZIP = archive("notes/readme.txt")
OFFICE_LOOKALIKE = archive("[Content_Types].xml", "_rels/.rels")
NESTED_DOCX_MEMBER = archive("evil/word/document.xml")
TRUNCATED_ZIP = b"PK\x03\x04" + b"\x00" * 20


_USER_SEQUENCE = itertools.count(1)


async def add_user(session: AsyncSession, email: str | None = None) -> User:
    """A fresh account per call: one test may need several actors."""
    user = User(
        email=email or f"ada{next(_USER_SEQUENCE)}@example.com",
        full_name="Ada Lovelace",
        hashed_password=hash_password(PASSWORD),
        roles=[],
    )
    session.add(user)
    await session.flush()
    return user


@pytest.fixture
def volume(tmp_path: Path) -> LocalVolumeStorage:
    """A private volume of this test's own — never the configured one."""
    return LocalVolumeStorage(tmp_path / "volume")


def stored_objects(volume: LocalVolumeStorage) -> list[str]:
    """The names of the objects in the volume, sorted.

    Names, not paths: on Windows a resolved path and an unresolved one are the
    same file spelled two ways, and every assertion here is about *what the
    object is called* — which is the key, and nothing a client sent.
    """
    if not volume.root.exists():
        return []
    return sorted(entry.name for entry in volume.root.iterdir() if entry.is_file())


async def count_assets(session: AsyncSession) -> int:
    return int(await session.scalar(select(func.count()).select_from(FileAsset)) or 0)


async def store(
    session: AsyncSession,
    volume: LocalVolumeStorage,
    *,
    data: bytes = PNG,
    original_filename: str = "logo.png",
    category: str = "templates",
    declared_content_type: str | None = None,
    **overrides: object,
) -> FileAsset:
    actor = overrides.pop("actor", None)
    if actor is None:
        actor = await add_user(session)
    return await storage.store_file(
        session,
        actor=actor,  # type: ignore[arg-type]
        data=data,
        original_filename=original_filename,
        category=category,
        declared_content_type=declared_content_type,
        backend=volume,
        **overrides,  # type: ignore[arg-type]
    )


# --------------------------------------------------------------------------
# Traversal: keys
# --------------------------------------------------------------------------


async def test_a_new_key_is_a_canonical_uuid(volume: LocalVolumeStorage) -> None:
    key = storage.new_storage_key()

    assert storage.is_storage_key(key)
    assert key == key.lower()
    assert storage.new_storage_key() != key


async def test_a_key_resolves_to_a_direct_child_of_the_volume(
    volume: LocalVolumeStorage,
) -> None:
    key = storage.new_storage_key()

    path = volume.object_path(key)

    assert path.parent == volume.root.resolve()
    assert path.name == key


@pytest.mark.parametrize(
    "hostile",
    [
        pytest.param("../../etc/passwd", id="relative-dot-dot"),
        pytest.param("..\\..\\windows\\win.ini", id="windows-separators"),
        pytest.param("/etc/passwd", id="absolute-posix"),
        pytest.param("C:\\Windows\\win.ini", id="absolute-drive"),
        pytest.param("file:///etc/passwd", id="file-url"),
        pytest.param("....//....//etc/passwd", id="doubled-dots"),
        pytest.param("00000000-0000-4000-8000-000000000001/../../evil", id="uuid-plus-traversal"),
        pytest.param("000000000000-0000-4000-8000-000000000001", id="malformed-hyphens"),
        pytest.param("00000000000040008000000000000000001", id="thirty-two-hex-digits"),
        pytest.param("00000000-0000-4000-8000-00000000000", id="one-character-short"),
        pytest.param("00000000-0000-4000-8000-000000000001\n", id="trailing-newline"),
        pytest.param("00000000-0000-4000-8000-000000000001 ", id="trailing-space"),
        pytest.param("{00000000-0000-4000-8000-000000000001}", id="braced-uuid"),
        pytest.param("00000000-0000-4000-8000-00000000000Z", id="non-hex-character"),
        pytest.param("00000000-0000-4000-8000-00000000000g", id="non-hex-letter"),
        pytest.param("0000000\uff10-0000-4000-8000-000000000001", id="fullwidth-digit"),
        pytest.param("00000000-0000-4000-8000-000000000001\x00", id="nul-terminated"),
        pytest.param("", id="empty"),
        pytest.param(".", id="dot"),
        pytest.param("..", id="dot-dot"),
    ],
)
async def test_no_other_string_addresses_an_object(
    volume: LocalVolumeStorage, hostile: str
) -> None:
    assert storage.is_storage_key(hostile) is False
    with pytest.raises(storage.InvalidStorageKey):
        volume.object_path(hostile)


async def test_a_symlink_planted_in_the_volume_cannot_escape_it(tmp_path: Path) -> None:
    """The one traversal a UUID key cannot rule out, as the resolver sees it."""
    root = tmp_path / "volume"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    key = storage.new_storage_key()
    try:
        os.symlink(outside, root / key, target_is_directory=True)
    except OSError, NotImplementedError:
        pytest.skip("this platform does not grant unprivileged symlink creation")

    volume = LocalVolumeStorage(root)

    with pytest.raises(storage.InvalidStorageKey):
        volume.object_path(key)
    with pytest.raises(storage.InvalidStorageKey):
        await volume.write(key, PNG)
    assert list(outside.iterdir()) == []


async def test_a_read_never_creates_the_volume(tmp_path: Path) -> None:
    volume = LocalVolumeStorage(tmp_path / "volume")
    key = storage.new_storage_key()

    assert await volume.exists(key) is False
    with pytest.raises(storage.ObjectNotFound):
        await volume.read(key)

    assert not volume.root.exists()


async def test_writing_creates_the_volume_and_leaves_no_debris(
    tmp_path: Path,
) -> None:
    volume = LocalVolumeStorage(tmp_path / "volume")
    key = storage.new_storage_key()

    await volume.write(key, PNG)

    path = volume.object_path(key)
    assert path.read_bytes() == PNG
    # The object is the only entry: the atomic-write temporary is gone.
    assert stored_objects(volume) == [key]
    assert await volume.exists(key) is True

    await volume.delete(key)
    assert await volume.exists(key) is False
    # Deleting what is not there is not an error — cleanup runs more than once.
    await volume.delete(key)


# --------------------------------------------------------------------------
# Traversal: the uploaded name
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("hostile", "expected"),
    [
        pytest.param("../../etc/passwd", "passwd", id="relative-dot-dot"),
        pytest.param("..\\..\\windows\\win.ini", "win.ini", id="windows-separators"),
        pytest.param("C:\\Users\\ada\\Q3 report.pdf", "Q3 report.pdf", id="drive-path"),
        pytest.param("/var/tmp/report.pdf", "report.pdf", id="absolute-posix"),
        pytest.param("invoice\x00.pdf", "invoice.pdf", id="embedded-nul"),
        pytest.param("in\nvoice\t.pdf", "invoice.pdf", id="control-characters"),
        pytest.param("<script>alert(1)</script>.txt", "script.txt", id="markup"),
        pytest.param("سجل.pdf", "سجل.pdf", id="unicode-kept"),
        pytest.param("Report.PDF", "Report.PDF", id="case-kept"),
        pytest.param("   ", "unnamed", id="blank"),
        pytest.param("", "unnamed", id="empty"),
        pytest.param(".", "unnamed", id="dot"),
        pytest.param("..", "unnamed", id="dot-dot"),
        pytest.param("/", "unnamed", id="separator-only"),
        pytest.param("..\\..\\", "unnamed", id="traversal-only"),
    ],
)
async def test_the_uploaded_name_is_reduced_to_a_display_name(hostile: str, expected: str) -> None:
    assert storage.sanitise_filename(hostile) == expected


async def test_a_name_is_bounded() -> None:
    assert len(storage.sanitise_filename("a" * 400)) == storage.MAX_FILENAME_LENGTH
    assert len(storage.sanitise_filename("b" * 300 + ".pdf")) == storage.MAX_FILENAME_LENGTH


# --------------------------------------------------------------------------
# MIME: what the bytes are
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        pytest.param(PNG, "image/png", id="png"),
        pytest.param(JPEG, "image/jpeg", id="jpeg"),
        pytest.param(PDF, "application/pdf", id="pdf"),
        pytest.param(DOCX, storage.DOCX_CONTENT_TYPE, id="docx"),
        pytest.param(XLSX, storage.XLSX_CONTENT_TYPE, id="xlsx"),
        pytest.param(CSV, "text/plain", id="csv-is-text"),
        pytest.param(TEXT_WITH_BOM, "text/plain", id="bom"),
        pytest.param(UNICODE_TEXT, "text/plain", id="non-ascii-utf8"),
    ],
)
async def test_contents_decide_the_type(payload: bytes, expected: str) -> None:
    assert storage.detect_content_type(payload) == expected


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(b"", id="empty"),
        pytest.param(b"   \n\t ", id="whitespace-only"),
        pytest.param(EXE, id="windows-executable"),
        pytest.param(ELF, id="elf-executable"),
        pytest.param(PLAIN_ZIP, id="plain-zip"),
        pytest.param(OFFICE_LOOKALIKE, id="office-ish-archive"),
        pytest.param(NESTED_DOCX_MEMBER, id="document-part-not-at-root"),
        pytest.param(TRUNCATED_ZIP, id="truncated-zip"),
        pytest.param(GZIP, id="gzip"),
        pytest.param(HTML, id="html"),
        pytest.param(SVG, id="svg"),
        pytest.param(b"\xef\xbb\xbf" + HTML, id="bom-html"),
        pytest.param(UTF16_TEXT, id="utf16-text"),
        pytest.param(INVALID_UTF8, id="invalid-utf8"),
    ],
)
async def test_markup_binaries_and_archives_have_no_accepted_type(payload: bytes) -> None:
    assert storage.detect_content_type(payload) is None


# --------------------------------------------------------------------------
# The service: rows, objects and the transaction nobody but the caller owns
# --------------------------------------------------------------------------


async def test_storing_writes_the_object_the_row_and_the_event(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    actor = await add_user(session)

    asset = await store(
        session,
        volume,
        actor=actor,
        original_filename="logo.png",
        declared_content_type="image/png",
        owner_user_id=actor.id,
    )

    assert asset.content_type == "image/png"
    assert asset.size == len(PNG)
    assert asset.sha256 == hashlib.sha256(PNG).hexdigest()
    assert asset.category == "templates"
    assert asset.owner_user_id == actor.id
    assert asset.created_at is not None
    assert storage.is_storage_key(asset.key)

    # The name on disk is the key, not the name the client sent.
    assert stored_objects(volume) == [asset.key]

    # The event rides the same transaction — and `file.create` is accepted by
    # the audit CHECK only because revision 0009 widened it.
    event = await session.scalar(select(AuditLog).where(AuditLog.action == "file.create"))
    assert event is not None
    assert event.entity_type == "file"
    assert event.entity_id == asset.id
    assert event.user_id == actor.id
    assert event.details == {
        "category": "templates",
        "content_type": "image/png",
        "sha256": asset.sha256,
        "size": len(PNG),
        "storage_key": asset.key,
    }


async def test_the_uploaded_name_never_reaches_the_volume(
    session: AsyncSession, volume: LocalVolumeStorage, tmp_path: Path
) -> None:
    """The traversal test at the level that matters: the end-to-end one."""
    asset = await store(
        session,
        volume,
        data=PDF,
        original_filename="../../evil.pdf",
        category="reports",
    )

    assert asset.original_filename == "evil.pdf"
    assert stored_objects(volume) == [asset.key]
    assert not (tmp_path / "evil.pdf").exists()
    assert not (tmp_path.parent / "evil.pdf").exists()


async def test_storing_does_not_commit(
    session: AsyncSession, volume: LocalVolumeStorage, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The caller owns the transaction (the F043/F045 discipline)."""

    async def forbidden_commit() -> None:
        raise AssertionError("store_file must not commit")

    monkeypatch.setattr(session, "commit", forbidden_commit)

    await store(session, volume)


@pytest.mark.parametrize(
    ("declared", "expected"),
    [
        pytest.param(None, "image/png", id="unstated"),
        pytest.param("image/png", "image/png", id="exact"),
        pytest.param("IMAGE/PNG", "image/png", id="case-insensitive"),
        pytest.param("image/png; charset=binary", "image/png", id="with-parameters"),
        pytest.param("application/octet-stream", "image/png", id="generic-is-unstated"),
    ],
)
async def test_a_declared_type_never_widens_what_the_bytes_say(
    session: AsyncSession, volume: LocalVolumeStorage, declared: str | None, expected: str
) -> None:
    asset = await store(session, volume, declared_content_type=declared)

    assert asset.content_type == expected


@pytest.mark.parametrize("declared", ["text/plain", "application/pdf", "image/jpeg"])
async def test_a_declared_type_that_contradicts_the_bytes_is_refused(
    session: AsyncSession, volume: LocalVolumeStorage, declared: str
) -> None:
    with pytest.raises(storage.ContentTypeMismatch):
        await store(session, volume, declared_content_type=declared)

    assert await count_assets(session) == 0
    assert stored_objects(volume) == []


@pytest.mark.parametrize(
    ("payload", "declared", "expected"),
    [
        pytest.param(CSV, "text/csv", "text/csv", id="csv-declared-csv"),
        pytest.param(CSV, None, "text/plain", id="csv-unstated"),
        pytest.param(CSV, "text/plain", "text/plain", id="csv-declared-plain"),
        pytest.param(CSV, "text/csv; charset=utf-8", "text/csv", id="csv-with-charset"),
        pytest.param(UNICODE_TEXT, "text/csv", "text/csv", id="text-declared-csv"),
    ],
)
async def test_the_one_refinement_a_client_may_make(
    session: AsyncSession,
    volume: LocalVolumeStorage,
    payload: bytes,
    declared: str | None,
    expected: str,
) -> None:
    """Text is the one family whose types share every byte-level signature."""
    asset = await store(
        session,
        volume,
        data=payload,
        original_filename="rows.csv",
        declared_content_type=declared,
    )

    assert asset.content_type == expected


async def test_a_name_and_a_type_do_not_make_a_file_what_it_claims(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    with pytest.raises(storage.UnsupportedFileType):
        await store(
            session,
            volume,
            data=EXE,
            original_filename="statement.pdf",
            category="reports",
            declared_content_type="application/pdf",
        )

    assert await count_assets(session) == 0
    assert stored_objects(volume) == []


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(b"", id="empty"),
        pytest.param(EXE, id="executable"),
        pytest.param(HTML, id="html"),
        pytest.param(PLAIN_ZIP, id="plain-zip"),
        pytest.param(INVALID_UTF8, id="invalid-utf8"),
    ],
)
async def test_contents_with_no_accepted_type_are_never_stored(
    session: AsyncSession, volume: LocalVolumeStorage, payload: bytes
) -> None:
    with pytest.raises(storage.UnsupportedFileType):
        await store(session, volume, data=payload, original_filename="upload.pdf")

    assert await count_assets(session) == 0
    assert stored_objects(volume) == []


async def test_the_cap_refuses_before_anything_is_written(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    smaller = get_settings().model_copy(update={"storage_max_upload_bytes": 8})

    with pytest.raises(storage.FileTooLarge):
        await store(session, volume, settings=smaller)

    assert await count_assets(session) == 0
    assert stored_objects(volume) == []

    # The cap is a limit, not a range: exactly at it is stored.
    exact = get_settings().model_copy(update={"storage_max_upload_bytes": len(PNG)})
    asset = await store(session, volume, settings=exact)
    assert asset.size == len(PNG)


async def test_a_type_removed_from_the_allowlist_is_refused(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    only_text = get_settings().model_copy(update={"storage_allowed_content_types": "text/plain"})

    with pytest.raises(storage.UnsupportedFileType):
        await store(session, volume, settings=only_text)

    assert stored_objects(volume) == []

    # And the allowlist is read the way it is written: a parameter or a space
    # in the configured entry does not change which type it names.
    written_oddly = get_settings().model_copy(
        update={"storage_allowed_content_types": " image/png ; charset=utf-8 , text/plain"}
    )
    asset = await store(session, volume, settings=written_oddly)
    assert asset.content_type == "image/png"


@pytest.mark.parametrize(
    "category",
    [
        pytest.param("", id="empty"),
        pytest.param("Templates", id="uppercase"),
        pytest.param("with space", id="space"),
        pytest.param("-leading", id="leading-punctuation"),
        pytest.param("réports", id="non-ascii"),
        pytest.param("x" * (storage.MAX_CATEGORY_LENGTH + 1), id="too-long"),
    ],
)
async def test_a_category_is_a_slug(
    session: AsyncSession, volume: LocalVolumeStorage, category: str
) -> None:
    with pytest.raises(storage.StorageError, match="category"):
        await store(session, volume, category=category)

    assert stored_objects(volume) == []


async def test_an_asset_may_have_no_owner(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    """A report template belongs to the library, not to whoever uploaded it."""
    asset = await store(session, volume, owner_user_id=None)

    assert asset.owner_user_id is None


class FlaggingScanner:
    """A scanner that refuses everything — the hook's "no" path."""

    async def scan(self, *, data: bytes, filename: str, content_type: str) -> None:
        raise storage.MalwareDetected("EICAR test signature.")


class RecordingScanner:
    """A scanner that accepts, and remembers what it was shown."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def scan(self, *, data: bytes, filename: str, content_type: str) -> None:
        self.calls.append((filename, content_type))


async def test_the_scan_hook_runs_before_anything_is_written(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    with pytest.raises(storage.MalwareDetected):
        await store(session, volume, scanner=FlaggingScanner())

    assert await count_assets(session) == 0
    assert stored_objects(volume) == []


async def test_the_scan_hook_sees_the_sanitised_name_and_the_sniffed_type(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    scanner = RecordingScanner()

    asset = await store(
        session,
        volume,
        original_filename="../../logo.png",
        declared_content_type="application/octet-stream",
        scanner=scanner,
    )

    assert scanner.calls == [("logo.png", "image/png")]
    assert asset.content_type == "image/png"


async def test_a_read_returns_the_bytes_and_verifies_the_checksum(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    asset = await store(session, volume)

    assert await storage.read_file(asset, backend=volume) == PNG

    # An object that no longer matches its row is a failure at the door, not a
    # download that quietly is not what the database says it is.
    volume.object_path(asset.key).write_bytes(PNG + b"more")
    with pytest.raises(storage.StorageIntegrityError):
        await storage.read_file(asset, backend=volume)


async def test_reading_a_missing_object_says_so(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    asset = await store(session, volume)
    volume.object_path(asset.key).unlink()

    with pytest.raises(storage.ObjectNotFound):
        await storage.read_file(asset, backend=volume)


async def test_deleting_records_the_event_and_hands_back_the_key(
    session: AsyncSession, volume: LocalVolumeStorage
) -> None:
    actor = await add_user(session)
    asset = await store(session, volume, actor=actor, original_filename="logo.png")
    asset_id, key = asset.id, asset.key

    # The producer half: F050's `delete_file` is the endpoint that commits and
    # then unlinks, and this is the step it calls.
    returned = await storage.delete_file_row(session, actor=actor, asset=asset)

    assert returned == key
    assert await count_assets(session) == 0
    event = await session.scalar(select(AuditLog).where(AuditLog.action == "file.delete"))
    assert event is not None
    assert event.entity_type == "file"
    assert event.entity_id == asset_id
    assert event.user_id == actor.id

    # The bytes outlive the row on purpose: they go once the caller commits.
    assert stored_objects(volume) == [key]
    await storage.remove_object(key, backend=volume)
    assert stored_objects(volume) == []
    # Cleanup runs more than once; the second time is not an error.
    await storage.remove_object(key, backend=volume)


async def test_the_default_backend_is_the_configured_volume() -> None:
    storage.get_storage.cache_clear()
    try:
        backend = storage.get_storage()

        assert isinstance(backend, LocalVolumeStorage)
        assert backend.root == get_settings().storage_root
    finally:
        storage.get_storage.cache_clear()
