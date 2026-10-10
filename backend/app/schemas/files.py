"""File shapes (F050).

One item, one list, and a deliberate omission: there is no ``key`` field. The
object's name in the volume is how *this application* addresses the bytes —
it is not a credential a client holds, and putting it on the wire would invite
exactly the direct-object addressing the private volume exists to make
impossible. A client gets an id and asks this API for the contents.

``sha256`` *is* here, because it is the one field a downloader can use: it is
the digest the row recorded and the server verifies on the way out, so a client
that wants to check what it received has something to check against.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class FileItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    original_filename: str
    # What the bytes are — sniffed at the door, never what a request claimed.
    content_type: str
    size: int
    sha256: str
    category: str
    created_at: datetime


class FileListResponse(BaseModel):
    items: list[FileItem]
    total: int
    page: int
    page_size: int
