"""Uploaded-file metadata — the row, never the bytes (F049; BIG-PROMPT §8.2g).

A stored file lives in two places with exactly one thing in common. The bytes
sit in a **private volume** under a UUID name; this table holds what the
application is allowed to know about them — the key, the name the uploader
used, the type the *sniffer* established, the size, the SHA-256 and the
category. Nothing here is a path: ``key`` addresses an object through
``app/services/storage.py`` and is never a filename, so the uploader's name
never reaches the filesystem and a row can be pointed elsewhere without the
volume hearing about it.

Two deliberate choices:

- **``created_at`` only, no ``updated_at``.** An asset is written once and
  deleted once; nothing edits it (the audit-table precedent, F043). A mutable
  row would invite "correcting" a checksum in place, which is the one thing a
  checksum exists to make visible.
- **``owner_user_id`` is ``ON DELETE SET NULL``.** The library outlives the
  account that uploaded into it: a report template or a shared reference must
  not vanish with its uploader, and the FK is attribution, not ownership (the
  same edge ``app_settings.updated_by`` and ``audit_logs.user_id`` take). The
  per-account personal-data edge is different — notifications and preferences
  cascade (F041) — and a file is not in that set unless a later task says so.

The CHECK constraints are the second layer of rules the service enforces first
(``app/services/storage.py``): a key shaped like a UUID and nothing else, a
positive size, a lowercase 64-character digest, a category in the same shape as
a preference key, and no empty name or type.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPrimaryKeyMixin

# The only name an object may have: a canonical lowercase UUID v4, with its
# hyphens and no case variation. Stated as a pattern and enforced in three
# places — the generator, the service's resolver, and this CHECK — because it
# is the whole of the traversal defence: a value that matches can never carry a
# separator, a dot or a drive letter.
STORAGE_KEY_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
STORAGE_KEY_LENGTH = 36

# The stored name is metadata (it is what a download is *called*, never where
# anything is read from), so it is bounded rather than trusted.
MAX_FILENAME_LENGTH = 255
MAX_CONTENT_TYPE_LENGTH = 100

# A category is the library's own vocabulary — a small slug the same shape as a
# preference key, so `files.templates` and `files.reports` are spellable and
# "some uppercase free text" is not.
CATEGORY_PATTERN = r"^[a-z][a-z0-9_.-]*$"
MAX_CATEGORY_LENGTH = 50

SHA256_PATTERN = r"^[0-9a-f]{64}$"
SHA256_LENGTH = 64


class FileAsset(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "file_assets"
    # Regex literals are concatenated rather than interpolated: an f-string
    # would eat the `{8}` quantifiers.
    __table_args__ = (
        CheckConstraint("key ~ '" + STORAGE_KEY_PATTERN + "'", name="key_is_an_object_name"),
        CheckConstraint(
            "length(trim(original_filename)) > 0",
            name="original_filename_is_present",
        ),
        CheckConstraint("length(trim(content_type)) > 0", name="content_type_is_present"),
        CheckConstraint("size > 0", name="size_is_positive"),
        CheckConstraint("sha256 ~ '" + SHA256_PATTERN + "'", name="sha256_is_a_digest"),
        CheckConstraint(
            "category ~ '" + CATEGORY_PATTERN + "'",
            name="category_is_well_formed",
        ),
        # One object, one row: the key is how a row is found from a byte name.
        Index(None, "key", unique=True),
        # F050 lists an owner's library newest-first; the index matches.
        Index(None, "owner_user_id", "created_at"),
    )

    # Attribution, not ownership — see the module docstring.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    # The object's name in the volume. Generated, never supplied by a request.
    key: Mapped[str] = mapped_column(String(STORAGE_KEY_LENGTH), nullable=False)
    # What the uploader called it, sanitised to a display name.
    original_filename: Mapped[str] = mapped_column(String(MAX_FILENAME_LENGTH), nullable=False)
    # The type the *sniffer* established, not the one a client claimed.
    content_type: Mapped[str] = mapped_column(String(MAX_CONTENT_TYPE_LENGTH), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Lowercase hex; verified on read, so a truncated or swapped object is a
    # loud failure rather than a plausible-looking download.
    sha256: Mapped[str] = mapped_column(String(SHA256_LENGTH), nullable=False)
    category: Mapped[str] = mapped_column(String(MAX_CATEGORY_LENGTH), nullable=False)

    # No TimestampMixin: there is no update path, so there is no updated_at.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
