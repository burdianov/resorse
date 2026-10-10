"""The private storage core: keys, sniffing, volume and rows (F049).

Four ideas, layered, each the reason the next one can be trusted.

- **An object's name is a UUID and nothing else.** ``new_storage_key`` mints
  one; ``is_storage_key`` recognises one with ``fullmatch`` — an anchored match,
  because Python's ``$`` also matches *before* a trailing newline, so a pattern
  that looks anchored is not. Because the only values that ever reach the
  filesystem are canonical UUIDs, a name cannot carry a separator, a dot, a
  drive letter or a NUL: traversal is not filtered here, it is unrepresentable.
  The resolver still re-checks that the resolved path is a direct child of the
  root, which is what catches the one thing a UUID cannot rule out — a symlink
  planted inside the volume.
- **What a client says about a file is not evidence.** ``detect_content_type``
  reads magic bytes (and, for the ZIP-based Office formats, the archive's own
  member names) and the stored ``content_type`` is *that*, never the
  ``Content-Type`` a request claimed. A declared type may only refine one
  unverifiable case — text, where ``text/csv`` and ``text/plain`` share every
  byte-level signature — and it may never widen the allowlist. The uploaded
  filename is treated the same way: ``sanitise_filename`` reduces it to a
  display name, and nothing about it ever reaches a path.
- **The volume is private and is nobody's URL.** Objects live under
  ``settings.storage_root`` — by default the repository's own git-ignored
  ``/data`` tree, pointing at a mounted volume in production. Nothing serves
  that directory, no route maps onto it, and every byte that leaves it does so
  through :func:`read_file`, which verifies the digest the row records before
  handing anything back.
- **The row is the record; the bytes are the payload.** Like ``audit.record``
  (F043) and ``notify`` (F045), the functions here *add* rows to the caller's
  session and never commit: the caller's transaction is the unit of work, so
  "the row exists" and "the change was committed" stay the same fact.

Both halves of BP-7.9a live in this module, and the split between them is the
transaction. The *producer* functions — :func:`store_file`,
:func:`delete_file_row` — add rows and audit events to the caller's session and
never commit, so a record and the change it describes stay the same fact.
The *endpoint* functions — :func:`upload_file`, :func:`delete_file`,
:func:`load_file`, :func:`list_files` — are the units of work a route calls:
they own the commit, and they are where BP-7.9a's authorization is decided.
**A file is reachable by its owner and by construction nothing else.** The row
id and the owner travel in one SQL predicate, so another account's file is
*not found* rather than *forbidden* (a 403 would confirm the id exists), and a
null-owner row — the system artifact a report pipeline will one day write — is
invisible here rather than shared with everyone.

No scanning engine is in this stack: :class:`NoMalwareScanner` is the shipped
implementation of BP-6.4's hook, named for what it does rather than for what a
caller might assume.

**The one place the pair can drift.** The object is written before the row and
unlinked after it, so a failure between those steps leaves an *unreferenced
object* — never a row pointing at nothing. That direction is chosen
deliberately: an orphan in a private volume costs disk and leaks nothing, while
a broken row is a download that fails for a user. :func:`upload_file` closes
the ordinary case, a commit that raises, by taking the object back out. What
remains is a process that dies between a successful commit and the unlink:
disk, and nothing else. No scheduler exists in this stack to sweep it, which is
recorded rather than pretended away.
"""

import hashlib
import io
import re
import uuid
import zipfile
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.files import (
    CATEGORY_PATTERN,
    MAX_CATEGORY_LENGTH,
    MAX_FILENAME_LENGTH,
    STORAGE_KEY_PATTERN,
    FileAsset,
)
from app.models.identity import User
from app.services import audit

# --------------------------------------------------------------------------
# Refusals
# --------------------------------------------------------------------------


class StorageError(Exception):
    """Base class for every refusal this module makes."""


class InvalidStorageKey(StorageError):
    """Not a canonical UUID key, or one that resolves outside the volume."""


class ObjectNotFound(StorageError):
    """No object is stored under this key."""


class FileNotFound(StorageError):
    """No file with this id belongs to this user.

    The row-side twin of :class:`ObjectNotFound`, and deliberately the one
    answer for "no such id" and "another account's id": the two are
    indistinguishable here because distinguishing them is what a 403 would do
    (F041's structural isolation, F045's rule for the inbox).
    """


class StorageIntegrityError(StorageError):
    """The stored bytes do not hash to the digest the row records."""


class FileTooLarge(StorageError):
    """The upload exceeds the per-file cap."""


class UnsupportedFileType(StorageError):
    """The contents match no accepted file type (or an empty upload)."""


class ContentTypeMismatch(UnsupportedFileType):
    """The declared type contradicts what the bytes are.

    A subclass of :class:`UnsupportedFileType` because that is what it is, from
    the caller's side: this file will not be stored as the type it claims.
    """


class MalwareDetected(StorageError):
    """The scan hook refused the upload."""


# --------------------------------------------------------------------------
# The vocabulary of types this project can verify from bytes
# --------------------------------------------------------------------------

GENERIC_CONTENT_TYPE = "application/octet-stream"

# The two Office formats are ZIP archives; these are the member names that
# distinguish one from the other and from a plain (rejected) zip.
DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_DOCX_MEMBER = "word/document.xml"
_XLSX_MEMBER = "xl/workbook.xml"

# The text family: valid UTF-8, no NUL, not markup. `text/plain` is what
# detection reports for all of it, and a *declared* type inside this set may
# narrow it to `text/csv` — the one refinement a client is allowed.
TEXT_CONTENT_TYPES = frozenset({"text/plain", "text/csv"})

_PDF_MAGIC = b"%PDF-"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"
_ZIP_MAGIC = b"PK\x03\x04"

# Characters that never belong in a displayed filename: both separator
# conventions plus the set Windows refuses, removed before anything is stored.
_UNSAFE_FILENAME_CHARS = frozenset('<>:"/\\|?*')

_KEY_RE = re.compile(STORAGE_KEY_PATTERN)
_CATEGORY_RE = re.compile(CATEGORY_PATTERN)


# --------------------------------------------------------------------------
# Pure helpers — keys, names, types. No session, no volume, no I/O.
# --------------------------------------------------------------------------


def new_storage_key() -> str:
    """Mint an object name.

    A version-4 UUID: random, which is the point — the name of an object must
    not be derivable from anything a client knows, so an object can only be
    reached through its row. The rows themselves keep the project's
    time-ordered v7 keys (F023); the two are deliberately different values, so
    a leaked row id names nothing in the volume.
    """
    return str(uuid.uuid4())


def is_storage_key(value: str) -> bool:
    """Whether ``value`` is a key this module would address an object by."""
    return _KEY_RE.fullmatch(value) is not None


def sanitise_filename(name: str) -> str:
    """The uploader's name, reduced to something safe to display.

    Never used to locate anything — the object's name is a UUID regardless —
    so this is about the two places the name *is* used: the metadata row and
    (F050) the ``Content-Disposition`` header. Both want a single short line:
    the last path component of either separator convention, printable
    characters only, separators and Windows-reserved characters dropped,
    whitespace collapsed, and a bounded length. The classic traversal names
    collapse to ``unnamed`` rather than to a blank field.
    """
    # Last component of a POSIX *or* Windows path: a client on either platform
    # may send whatever its file picker had.
    tail = name.replace("\\", "/").rsplit("/", 1)[-1]
    kept = "".join(
        character
        for character in tail
        if character.isprintable() and character not in _UNSAFE_FILENAME_CHARS
    )
    cleaned = " ".join(kept.split())
    if cleaned in {"", ".", ".."}:
        return "unnamed"
    return cleaned[:MAX_FILENAME_LENGTH].rstrip()


def detect_content_type(data: bytes) -> str | None:
    """The type the bytes *are*, or ``None`` when it is not one we accept.

    Magic-byte sniffing establishes a family, not validity: a PDF here has a
    PDF header, which is not the same claim as "a PDF a reader will open" —
    parsing the parsable formats for real is F051's task. What it does
    establish is the thing that matters at this door: an executable renamed to
    ``.pdf`` is not a PDF, because its bytes say so.
    """
    if not data:
        return None
    if data.startswith(_PDF_MAGIC):
        return "application/pdf"
    if data.startswith(_PNG_MAGIC):
        return "image/png"
    if data.startswith(_JPEG_MAGIC):
        return "image/jpeg"
    office = _detect_office(data)
    if office is not None:
        return office
    if _is_plain_text(data):
        return "text/plain"
    return None


def _detect_office(data: bytes) -> str | None:
    """A DOCX, an XLSX, or ``None`` — including for a zip that is neither.

    The archive's member names are the only honest signal here: both formats
    share the zip magic with every other zip, so "it is a zip" says nothing,
    and a plain zip is simply not an accepted type.
    """
    if not data.startswith(_ZIP_MAGIC):
        return None
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
    except zipfile.BadZipFile, zipfile.LargeZipFile, OSError, EOFError, ValueError:
        # A truncated or malformed archive is not a document.
        return None
    if _DOCX_MEMBER in names:
        return DOCX_CONTENT_TYPE
    if _XLSX_MEMBER in names:
        return XLSX_CONTENT_TYPE
    return None


def _is_plain_text(data: bytes) -> bool:
    """Valid UTF-8 with no NUL and no markup at the head.

    The NUL check is what separates text from UTF-16, and the markup check is
    what keeps the library a library: HTML and SVG are *active* content, and a
    stored file is one download away from a browser. Nothing in this project
    needs to store a page, so a payload that opens with ``<`` is refused rather
    than stored as harmless-looking ``text/plain``.
    """
    if b"\x00" in data:
        return False
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return False
    head = text.lstrip()
    if not head:
        return False
    return not head.startswith("<")


def _agreed_content_type(detected: str, declared: str | None, allowed: frozenset[str]) -> str:
    """What the row will record, given what the bytes are and what was claimed."""
    if declared is None:
        return detected
    claimed = declared.split(";")[0].strip().lower()
    if not claimed or claimed == GENERIC_CONTENT_TYPE or claimed == detected:
        return detected
    if detected in TEXT_CONTENT_TYPES and claimed in TEXT_CONTENT_TYPES and claimed in allowed:
        return claimed
    # The declared value is echoed only up to the column's width: it is client
    # input, and a refusal message must not carry a megabyte of it.
    raise ContentTypeMismatch(
        f"The upload declares `{claimed[:100]}`, but its contents are `{detected}`."
    )


# --------------------------------------------------------------------------
# Adapters
# --------------------------------------------------------------------------


class StorageBackend(Protocol):
    """Where bytes live (BP-7.9a's "interface for a future S3 backend").

    The methods are ``async`` so that the second adapter this interface exists
    for can be genuinely non-blocking. The local volume's are ``async`` and
    blocking: a file copy is a syscall pair, which is the honest description of
    what a local volume does, and pretending otherwise with a thread pool would
    buy nothing at these sizes.

    The key is the adapter's contract to enforce, not merely to receive: every
    implementation must refuse anything that is not a canonical UUID (and, for
    a local volume, anything that resolves outside its root).
    """

    async def write(self, key: str, data: bytes) -> None:
        """Store ``data`` under ``key``, replacing any object already there."""

    async def read(self, key: str) -> bytes:
        """Return the object's bytes, or raise :class:`ObjectNotFound`."""

    async def exists(self, key: str) -> bool:
        """Whether an object is stored under ``key``."""

    async def delete(self, key: str) -> None:
        """Remove the object; deleting what is not there is not an error."""


class LocalVolumeStorage:
    """A directory on this machine. The only adapter that ships (BP-7.9a)."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def object_path(self, key: str) -> Path:
        """The file ``key`` names, or :class:`InvalidStorageKey`.

        Two checks, and both are load-bearing. The key must be a canonical UUID
        (so it cannot *spell* a path), and the resolved candidate must be a
        direct child of the resolved root (so a symlink placed at that name
        cannot *become* one). ``resolve`` on a path that does not exist yet is
        well defined: it resolves what is there and leaves the rest.
        """
        if not is_storage_key(key):
            raise InvalidStorageKey(
                "A storage key is a canonical lowercase UUID "
                "(8-4-4-4-12 hex digits); nothing else addresses an object.",
            )
        root = self.root.resolve()
        resolved = (self.root / key).resolve()
        if resolved.parent != root:
            raise InvalidStorageKey(
                f"Refusing a key that resolves outside the storage root: {key}.",
            )
        return resolved

    async def write(self, key: str, data: bytes) -> None:
        path = self.object_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write beside the target and rename: a reader sees the whole object or
        # no object, never half of one. The temporary name is not a valid key,
        # so nothing can address it — a leftover `.part` after a crash is
        # litter in a private volume, not a readable file.
        temporary = path.with_name(path.name + ".part")
        temporary.write_bytes(data)
        temporary.replace(path)

    async def read(self, key: str) -> bytes:
        try:
            return self.object_path(key).read_bytes()
        except FileNotFoundError as error:
            raise ObjectNotFound(f"No object is stored under key {key}.") from error

    async def exists(self, key: str) -> bool:
        return self.object_path(key).is_file()

    async def delete(self, key: str) -> None:
        try:
            self.object_path(key).unlink()
        except FileNotFoundError:
            # Idempotent by design: cleanup runs after commits, on retries, and
            # on transactions that never happened.
            return


def get_malware_scanner() -> MalwareScanner:
    """The scanner the upload route uses (F060; BP-6.4 "malware-scan hook").

    The shipped answer is :class:`NoMalwareScanner`, and it is the only one
    this codebase provides. A deployment that has a scanning engine changes
    this function (or overrides the route's dependency) — the route, the
    refusal mapping and the audit trail do not change with it. Uploads are
    never described as scanned while this is the answer.
    """
    return NoMalwareScanner()


@lru_cache
def get_storage() -> StorageBackend:
    """The configured backend, created once per process.

    Cached because the root is configuration: a test that changes the setting
    calls ``get_storage.cache_clear()``, exactly as ``get_settings`` is
    reloaded (F023's lesson about cached singletons and the environment).
    """
    return LocalVolumeStorage(get_settings().storage_root)


class MalwareScanner(Protocol):
    """The scan hook (BP-6.4 "malware scan hook").

    The contract is one method that must not return normally for a bad file:
    raising :class:`MalwareDetected` is the only way to say no, so a scanner
    that forgets to report cannot pass a file by accident.
    """

    async def scan(self, *, data: bytes, filename: str, content_type: str) -> None:
        """Raise :class:`MalwareDetected` if the upload must not be stored."""


class NoMalwareScanner:
    """The shipped scanner: it scans nothing, and is named accordingly.

    §7.9 does not add a scanning engine to the stack, so the honest
    implementation of the hook is one that does nothing — and says so in its
    name, so no reader mistakes a stored file for a *scanned* one. A deployment
    that has ClamAV or a service passes its own scanner to :func:`store_file`;
    until then the record shows an object that passed the type and size checks
    and nothing more.
    """

    async def scan(self, *, data: bytes, filename: str, content_type: str) -> None:
        return None


# --------------------------------------------------------------------------
# The service
# --------------------------------------------------------------------------


async def store_file(
    session: AsyncSession,
    *,
    actor: User,
    data: bytes,
    original_filename: str,
    category: str,
    declared_content_type: str | None = None,
    owner_user_id: uuid.UUID | None = None,
    backend: StorageBackend | None = None,
    scanner: MalwareScanner | None = None,
    settings: Settings | None = None,
) -> FileAsset:
    """Validate an upload, put the bytes in the volume, and add its row.

    The order is the point. Validation, then the scan hook, then the object,
    then the row: nothing is written that a rule refused, and nothing is
    recorded that is not on disk. The row and the audit event ride the caller's
    transaction (this function never commits), so a caller that fails afterwards
    leaves no metadata — at the cost of an unreferenced object, which is the
    safe direction the module docstring explains.

    ``backend``, ``scanner`` and ``settings`` are the seams: the tests inject a
    temporary volume, and F050 will inject a real scanner when a deployment has
    one. In production all three defaults are what the configuration says.
    """
    resolved_settings = settings or get_settings()
    filename = sanitise_filename(original_filename)

    category = category.strip()
    if not _CATEGORY_RE.fullmatch(category) or len(category) > MAX_CATEGORY_LENGTH:
        raise StorageError(
            "A file category is a lowercase slug like `templates` or `reports` "
            f"(at most {MAX_CATEGORY_LENGTH} characters).",
        )

    if not data:
        raise UnsupportedFileType("An empty upload has no file type.")
    if len(data) > resolved_settings.storage_max_upload_bytes:
        raise FileTooLarge(
            f"The upload is {len(data)} bytes, over the "
            f"{resolved_settings.storage_max_upload_bytes}-byte limit.",
        )

    detected = detect_content_type(data)
    if detected is None:
        raise UnsupportedFileType(
            "The upload's contents match no accepted file type — the file's "
            "extension and declared type are not evidence of what it is.",
        )
    allowed = resolved_settings.allowed_content_types
    if detected not in allowed:
        raise UnsupportedFileType(
            f"`{detected}` is not an accepted file type here "
            f"(accepted: {', '.join(sorted(allowed))}).",
        )
    content_type = _agreed_content_type(detected, declared_content_type, allowed)

    # Before anything is written: a scanner that refuses leaves no trace, and a
    # scanner that is absent leaves an upload that was type- and size-checked.
    await (scanner or NoMalwareScanner()).scan(
        data=data, filename=filename, content_type=content_type
    )

    digest = hashlib.sha256(data).hexdigest()
    key = new_storage_key()
    volume: StorageBackend = backend or get_storage()
    await volume.write(key, data)

    asset = FileAsset(
        owner_user_id=owner_user_id,
        key=key,
        original_filename=filename,
        content_type=content_type,
        size=len(data),
        sha256=digest,
        category=category,
    )
    session.add(asset)
    try:
        await session.flush()
        await audit.record(
            session,
            actor=actor,
            action="file.create",
            entity_type="file",
            entity_id=asset.id,
            summary=f"Stored file {filename} ({content_type}, {len(data)} bytes).",
            details={
                "category": category,
                "content_type": content_type,
                "sha256": digest,
                "size": len(data),
                "storage_key": key,
            },
        )
    except Exception:
        # The row will not exist, so the object would be unreachable: take it
        # back out. A failure here must not mask the original error, which is
        # the one the caller needs to see.
        await _discard(volume, key)
        raise
    return asset


async def read_file(asset: FileAsset, *, backend: StorageBackend | None = None) -> bytes:
    """The object's bytes, verified against the digest its row records.

    A checksum that is only ever written is decoration. Verifying on the way
    out turns a truncated object, a swapped one, or a disk that lost bytes into
    a failure at the door rather than a download that quietly is not what the
    database says it is.
    """
    volume: StorageBackend = backend or get_storage()
    data = await volume.read(asset.key)
    if hashlib.sha256(data).hexdigest() != asset.sha256:
        raise StorageIntegrityError(
            f"The stored object for {asset.original_filename} does not match the "
            "checksum recorded for it.",
        )
    return data


async def delete_file_row(session: AsyncSession, *, actor: User, asset: FileAsset) -> str:
    """Remove the row and record the deletion; return the key of the object.

    The object is **not** deleted here. It is deleted by the caller, **after**
    its transaction commits, with :func:`remove_object`: unlinking before the
    row is durable would leave a row pointing at nothing if the transaction
    rolled back — the one failure direction the module docstring rules out.
    The endpoint that does both is :func:`delete_file`.
    """
    key, filename, entity_id = asset.key, asset.original_filename, asset.id
    await session.delete(asset)
    await session.flush()
    await audit.record(
        session,
        actor=actor,
        action="file.delete",
        entity_type="file",
        entity_id=entity_id,
        summary=f"Deleted file {filename}.",
        details={"storage_key": key},
    )
    return key


async def remove_object(key: str, *, backend: StorageBackend | None = None) -> None:
    """Delete an object's bytes. Idempotent — see :func:`delete_file_row`."""
    volume: StorageBackend = backend or get_storage()
    await volume.delete(key)


# --------------------------------------------------------------------------
# The endpoints' units of work (F050). These own the commit; the producers
# above deliberately do not.
# --------------------------------------------------------------------------


async def upload_file(
    session: AsyncSession,
    *,
    actor: User,
    data: bytes,
    original_filename: str,
    category: str,
    declared_content_type: str | None = None,
    backend: StorageBackend | None = None,
    scanner: MalwareScanner | None = None,
    settings: Settings | None = None,
) -> FileAsset:
    """Store an upload and settle it: the unit of work behind ``POST /files``.

    :func:`store_file` is the producer and never commits; this is the caller
    that owns the request's transaction. The owner is the actor and cannot be
    anything else — an upload that could write an ownerless row would be a way
    to mint a file that the isolation rule above does not cover.

    The ``except`` is the interesting line. If the commit fails, the row is
    gone and the object the producer already wrote is unreachable, so it goes
    back out instead of accumulating. A failure there must not mask the commit
    failure, which is the one the caller needs to see.
    """
    volume: StorageBackend = backend or get_storage()
    asset = await store_file(
        session,
        actor=actor,
        data=data,
        original_filename=original_filename,
        category=category,
        declared_content_type=declared_content_type,
        owner_user_id=actor.id,
        backend=volume,
        scanner=scanner,
        settings=settings,
    )
    try:
        await session.commit()
    except Exception:
        await _discard(volume, asset.key)
        raise
    return asset


async def load_file(session: AsyncSession, *, user_id: uuid.UUID, file_id: uuid.UUID) -> FileAsset:
    """The caller's own file, or :class:`FileNotFound`.

    One predicate, both halves of it. Selecting the row by id and comparing the
    owner in Python would load a stranger's row into this process and would
    leave the decision to whoever remembered to compare; here the id and the
    owner are the *same* query, so there is no state in which the row is
    loaded and the check has not happened.
    """
    asset = await session.scalar(
        select(FileAsset).where(FileAsset.id == file_id, FileAsset.owner_user_id == user_id)
    )
    if asset is None:
        raise FileNotFound(f"No file {file_id} belongs to this user.")
    return asset


async def list_files(
    session: AsyncSession, *, user_id: uuid.UUID, page: int, page_size: int
) -> tuple[list[FileAsset], int]:
    """One page of the caller's library (newest first) and its total.

    The order is ``created_at`` descending with the id as tiebreaker: two files
    uploaded in one transaction share an instant, and a page that could order
    them either way would show one of them twice and the other never.
    """
    owner = FileAsset.owner_user_id == user_id
    total = await session.scalar(select(func.count()).select_from(FileAsset).where(owner))
    rows = await session.scalars(
        select(FileAsset)
        .where(owner)
        .order_by(FileAsset.created_at.desc(), FileAsset.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(rows), int(total or 0)


async def delete_file(
    session: AsyncSession, *, actor: User, user_id: uuid.UUID, file_id: uuid.UUID
) -> None:
    """Delete one of the caller's files: row, audit event, commit, then bytes.

    The three steps are the three functions above it — :func:`load_file`, which
    is where another account's id becomes a not-found, :func:`delete_file_row`
    for the durable half, and :func:`remove_object` **after** the commit, so a
    rollback leaves an object rather than a row pointing at nothing.

    A failure to unlink is swallowed: the deletion has already committed, so
    the caller is entitled to see it succeed, and reporting a completed
    deletion as an error would invite a retry that 404s. The leftover object is
    the safe direction the module docstring explains.
    """
    asset = await load_file(session, user_id=user_id, file_id=file_id)
    key = await delete_file_row(session, actor=actor, asset=asset)
    await session.commit()
    try:
        await remove_object(key)
    except OSError:
        return


async def _discard(volume: StorageBackend, key: str) -> None:
    """Best-effort unlink after a failed store (see :func:`store_file`)."""
    try:
        await volume.delete(key)
    except StorageError, OSError:
        # The original failure is the one worth reporting; a leftover object in
        # a private volume is the failure mode this whole design prefers.
        return
