"""Request and response shapes for /auth (F028).

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
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# `users.email` is String(320) (RFC 5321's maximum); one bound for both layers.
MAX_EMAIL_LENGTH = 320
MAX_PASSWORD_LENGTH = 1024


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=MAX_EMAIL_LENGTH)
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


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
