"""Passwords and session secrets: hashing, verification, and the policy.

Two credentials, two different jobs, two deliberately different tools:

- **Session tokens** (F025) are 256 bits of ``secrets`` randomness, so there is
  nothing to brute-force and nothing to slow down: SHA-256, stored as a hex
  digest that doubles as the lookup key (``sessions.token_hash``).
- **Passwords** (F026) are chosen by humans, so they are guessable and deserve
  a deliberately slow, memory-hard function: Argon2id (RFC 9106; the BP-6.1d
  preference) with the parameters below reviewed rather than ambient.

The Argon2 parameters are constants, not settings, on purpose: a deployment
that can quietly weaken the hash function is a foot-gun, and policy that a
user experiences (length bounds, denylist, throttling) is configurable in
``Settings`` instead. Changing the parameters later is a code change plus a
rollout: ``password_needs_rehash`` is what tells the next successful login to
upgrade its row, so strengthening the policy never needs a reset wave.

Three rules here are easy to get wrong, so each is tested as a rule:

- ``verify_password`` returns ``False`` for a malformed stored hash instead of
  raising: an unusable credential is a failed login, not a 500. It only ever
  reports "matches" or "does not" — never *why*.
- ``password_needs_rehash`` answers "is this row below current policy?"; a
  malformed row is a yes (it must be replaced), a current row is a no.
- Policy messages never echo the password. A violation list is rendered to the
  user and written to logs; the value itself must not appear in either.

Password hashing and policy are separate on purpose: ``hash_password`` accepts
anything, policy decides what is admissible, and the API boundary (F033, F042)
runs the policy *before* hashing. F028 equalises login timing for unknown
accounts itself (BP-6.2g: no user enumeration); this module offers only the
primitives, not an opinion about login flow.
"""

import hashlib
import secrets
from dataclasses import dataclass

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

# --- Session tokens (F025) ---------------------------------------------------

# 256 bits, per ARCHITECTURE §3 ("256-bit random session ID").
SESSION_TOKEN_BYTES = 32

# Lowercase SHA-256 hex — exactly what `hashlib.sha256(...).hexdigest()` returns.
SESSION_TOKEN_HASH_PATTERN = r"^[0-9a-f]{64}$"


def generate_session_token() -> str:
    """A fresh 256-bit session ID.

    URL-safe base64, because the value travels as a cookie: no characters that
    a header, a cookie jar or a log line would need to escape.
    """
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def hash_session_token(token: str) -> str:
    """The digest stored in ``sessions.token_hash``.

    UTF-8, not ASCII: the input is attacker-controlled (whatever the cookie
    carried), and an encoding error here would be a 500 where a plain mismatch
    is the correct answer. For the base64url values this module generates, the
    two encodings are identical.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# --- Password hashing (F026) -------------------------------------------------

# OWASP Password Storage Cheat Sheet, first Argon2id option: 19 MiB of memory,
# two passes, single lane. Memory-hardness is the property that makes GPU
# cracking expensive, which is why max_length exists downstream: it keeps a
# hostile 100 MB "password" from turning a login into a memory event.
PASSWORD_HASH_LENGTH = 32
PASSWORD_SALT_LENGTH = 16


@dataclass(frozen=True)
class Argon2Parameters:
    """The cost parameters a stored hash was (or will be) produced with."""

    time_cost: int
    memory_cost_kib: int
    parallelism: int


ARGON2_PARAMETERS = Argon2Parameters(time_cost=2, memory_cost_kib=19_456, parallelism=1)


def build_password_hasher(parameters: Argon2Parameters = ARGON2_PARAMETERS) -> PasswordHasher:
    """A hasher for the given parameters. Tests and F060's policy rollover use
    a cheaper instance; production code uses the module default."""
    return PasswordHasher(
        time_cost=parameters.time_cost,
        memory_cost=parameters.memory_cost_kib,
        parallelism=parameters.parallelism,
        hash_len=PASSWORD_HASH_LENGTH,
        salt_len=PASSWORD_SALT_LENGTH,
        type=Type.ID,
    )


_PASSWORD_HASHER = build_password_hasher()


def hash_password(password: str, *, hasher: PasswordHasher | None = None) -> str:
    """The Argon2id string stored in ``users.hashed_password``.

    The salt is generated per call, so two hashes of the same password never
    match — which is the point. The plaintext exists only in the caller's
    frame; nothing here stores, returns or logs it.
    """
    return (hasher or _PASSWORD_HASHER).hash(password)


def verify_password(
    password: str,
    hashed_password: str,
    *,
    hasher: PasswordHasher | None = None,
) -> bool:
    """Whether ``password`` produced ``hashed_password``. Never raises on the
    stored value: a row that is not a valid Argon2 hash is a credential that
    cannot match anything, so the answer is simply False."""
    try:
        (hasher or _PASSWORD_HASHER).verify(hashed_password, password)
    except VerifyMismatchError, VerificationError, InvalidHashError:
        return False
    return True


def password_needs_rehash(
    hashed_password: str,
    *,
    hasher: PasswordHasher | None = None,
) -> bool:
    """Whether an existing row should be upgraded to the current parameters.

    True for a row hashed under weaker parameters *and* for a row that is not a
    usable hash at all — in both cases the next successful login (F028) should
    re-hash the password and store the result.
    """
    try:
        return (hasher or _PASSWORD_HASHER).check_needs_rehash(hashed_password)
    except InvalidHashError:
        return True


# --- Password policy (F026) --------------------------------------------------

# The perennial top of leak dumps — the passwords that make credential
# stuffing worth attempting. Matching is case-insensitive exact, which is the
# honest floor: a full breached-password corpus check (k-anonymity APIs) is
# explicitly out of scope because nothing here may call an external service.
# The list lives in code so it ships, is reviewable in a diff, and never
# changes with a network.
COMMON_PASSWORDS = frozenset(
    {
        "000000",
        "102030",
        "111111",
        "112233",
        "121212",
        "123123",
        "123321",
        "123456",
        "1234567",
        "12345678",
        "123456789",
        "1234567890",
        "123456a",
        "123qwe",
        "131313",
        "159753",
        "1q2w3e",
        "1q2w3e4r",
        "1qaz2wsx",
        "1qazxsw2",
        "555555",
        "654321",
        "666666",
        "777777",
        "7777777",
        "888888",
        "987654",
        "987654321",
        "999999",
        "a123456",
        "access",
        "adam",
        "admin",
        "admin123",
        "alex",
        "andrea",
        "angel",
        "anthony",
        "asdf1234",
        "asdfgh",
        "asdfghjkl",
        "ashley",
        "bailey",
        "banana",
        "baseball",
        "batman",
        "charlie",
        "changeme",
        "computer",
        "daniel",
        "dubai",
        "donald",
        "dragon",
        "flower",
        "football",
        "football1",
        "freedom",
        "george",
        "google",
        "guest",
        "hello",
        "hello123",
        "hunter",
        "iloveyou",
        "iloveyou1",
        "jennifer",
        "jessica",
        "jesus",
        "jordan",
        "joshua",
        "killer",
        "letmein",
        "letmein123",
        "liverpool",
        "love",
        "maggie",
        "master",
        "matrix",
        "mercedes",
        "michael",
        "michelle",
        "monkey",
        "mustang",
        "ninja",
        "nothing",
        "passw0rd",
        "password",
        "password!",
        "password1",
        "password12",
        "password123",
        "p@ssw0rd",
        "pepper",
        "princess",
        "q1w2e3r4",
        "q1w2e3r4t5",
        "qazwsx",
        "qwe123",
        "qwerty",
        "qwerty1",
        "qwerty123",
        "qwerty12345",
        "qwertyuiop",
        "root",
        "secret",
        "shadow",
        "soccer",
        "starwars",
        "sunshine",
        "superman",
        "test",
        "test123",
        "thomas",
        "toor",
        "trustno1",
        "uae",
        "welcome",
        "welcome1",
        "welcome123",
        "whatever",
        "william",
        "zaq12wsx",
        "zxcvbnm",
    }
)


def password_policy_violations(
    password: str,
    *,
    email: str | None = None,
    min_length: int | None = None,
    max_length: int | None = None,
) -> list[str]:
    """Every rule the candidate password breaks, as displayable sentences.

    All violations are returned at once so a form can show the full picture in
    one round trip. Messages never contain the password itself (see the module
    docstring): a denylist hit says *that* it is common, not *what* it is.

    ``min_length``/``max_length`` default to the configured policy; passing
    them explicitly is for tests and for callers that run under a different
    policy than the process default.
    """
    settings = get_settings()
    minimum = settings.password_min_length if min_length is None else min_length
    maximum = settings.password_max_length if max_length is None else max_length

    violations: list[str] = []
    if password != password.strip():
        violations.append("Password cannot start or end with whitespace.")
    if len(password) < minimum:
        violations.append(f"Password must be at least {minimum} characters long.")
    if len(password) > maximum:
        violations.append(f"Password must be at most {maximum} characters long.")

    candidate = password.lower()
    if candidate in COMMON_PASSWORDS:
        violations.append("This password appears on common-password lists; choose another.")
    if email:
        local_part = email.split("@", 1)[0].lower()
        if candidate in (email.lower(), local_part):
            violations.append("This password is based on the email address; choose another.")
    return violations
