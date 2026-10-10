"""Per-user notifications (F045): the inbox behind the header bell.

§8.2's model: title, message, an optional **safe internal link**, `is_read`,
timestamps — per user, `ON DELETE CASCADE` (an inbox is personal data with no
audit value, the F041 preference edge). Rows are written by *other services*
through ``app/services/notifications.py::notify`` (inside their own
transaction — the F043 discipline), never by a self-service create endpoint:
"notify me about things I did" is not a feature, and a public create endpoint
would be a spam relay for the account itself.

**The link is a path, not a URL, and the database says so.** A stored
``https://evil.example`` (or a protocol-relative ``//host``) would turn the
inbox into an open redirect for anyone who can write a row — which is every
future producer. The CHECK pins the shape at the floor; ``notify`` validates
the same rule at the door (F024's two-layer convention); the frontend renders
it through the router (F046), where an internal path can only go in-app.
"""

import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin

# Mirrors the F024/F039 conventions: the API validates before writing, the
# CHECK is what stops a script or a console session. The first character must
# be alphanumeric: `/` alone links nowhere useful, `//host` is protocol-
# relative, `/\host` is treated as `//host` by some URL parsers, and a
# leading `%` could decode into either — the strict head closes all of them.
NOTIFICATION_LINK_PATTERN = r"^/[A-Za-z0-9]"
MAX_TITLE_LENGTH = 200
MAX_MESSAGE_LENGTH = 1000
MAX_LINK_LENGTH = 500


class Notification(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0", name="title_is_present"),
        CheckConstraint("length(trim(message)) > 0", name="message_is_present"),
        # A stored path that starts with `/` and not `//` — see the module
        # docstring for why this is a database rule and not a style guide.
        CheckConstraint(
            f"link IS NULL OR link ~ '{NOTIFICATION_LINK_PATTERN}'",
            name="link_is_an_internal_path",
        ),
        # The inbox query: this user's rows, newest first.
        Index(None, "user_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(MAX_TITLE_LENGTH), nullable=False)
    message: Mapped[str] = mapped_column(String(MAX_MESSAGE_LENGTH), nullable=False)
    link: Mapped[str | None] = mapped_column(String(MAX_LINK_LENGTH))
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
