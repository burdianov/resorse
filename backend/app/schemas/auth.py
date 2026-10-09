"""Request and response shapes for /auth (F028; F030 adds the password change).

The login request is validated for **shape only** — a string of a sane length,
never an ``EmailStr``. A login form must answer every credential problem with
the same 401; parsing rules that reject ``not-an-email`` before the credential
check would turn the endpoint into a filter that distinguishes inputs, which is
exactly the distinguishing BP-6.2g forbids ("login failures must not enumerate
users"). The email is canonicalised and bounded in the service, and the unique
index does the real matching.

The password bound is not policy: ``Settings.password_max_length`` governs what
may be *set*. Login must accept whatever the policy of the day stored, so the
only limit here is a hostile-body cap — the full request-size cap is F060's.
The same split applies to F030's change request: the schema caps the body, and
the *policy* runs in the service — not here — because the denylist's email rule
needs the user's address, which only the database knows. A policy failure
therefore reaches the caller as a field-addressable 422 built by the endpoint,
never as a schema error.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# `users.email` is String(320) (RFC 5321's maximum); one bound for both layers.
MAX_EMAIL_LENGTH = 320
MAX_PASSWORD_LENGTH = 1024


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=MAX_EMAIL_LENGTH)
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class ChangePasswordRequest(BaseModel):
    """Self-service credential change (F030). Both fields are shape-bounded
    only — see the module docstring for where the real policy lives."""

    current_password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)
    new_password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class AuthenticatedUser(BaseModel):
    """Who just signed in — identity only.

    No roles and no permissions: the effective permission union is resolved by
    F031's dependency and served by ``/auth/me``. Login answers "here is your
    session", not "here is everything about you"; a second round trip after
    sign-in is the honest cost of keeping one definition of the access set.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    # True for admin-provisioned accounts: the frontend must route to the
    # forced change screen (F030/F032); backend enforcement is F031's.
    must_change_password: bool


class LoginResponse(BaseModel):
    user: AuthenticatedUser


class MeResponse(AuthenticatedUser):
    """``/auth/me`` — identity plus the effective access set (F031).

    Extends the login response rather than restating it: the identity fields
    are the same four, and one definition of "who is this" beats two that
    almost match. ``roles`` are names (the UI displays them; ids belong to the
    admin editor, F033), and ``permissions`` is the **expanded union** — a
    superuser sees every code's name, never a wildcard, so the frontend checks
    set membership and never special-cases a flag. Both lists are sorted, so
    responses are deterministic and diffable.

    ``is_active``/``is_deleted`` are deliberately absent: a session belonging
    to a disabled account does not resolve at all (F029), so fields that could
    only ever read "true" would be decoration. ``is_superuser`` is served —
    the SPA's access model carries an explicit super-admin flag
    (``src/config/access.ts``, ARCHITECTURE §6's "explicit super-admin
    handling"), and one truthful boolean beats a client that hardcodes
    ``false`` and re-derives authority from grant-list length.
    """

    phone: str | None
    is_superuser: bool
    roles: list[str]
    permissions: list[str]


class UpdateMeRequest(BaseModel):
    """Self-service profile edit (F041, §7.6): the fields a user owns.

    **Email is absent on purpose** — it is admin-managed (§7.3, F033), and
    ``extra="forbid"`` makes a payload that tries anyway a 422 at the unknown
    field instead of a silent no-op: the one thing worse than "you cannot
    change this here" is "we accepted it and nothing happened".

    Absence and explicit ``null`` differ, the F033 convention: an absent
    field is untouched; ``"phone": null`` clears the phone.
    """

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=32)
