"""Session secrets: generation, and the one-way digest the database stores.

ARCHITECTURE §3 (DECISIONS C12) is explicit: the raw session ID exists only in
the cookie the browser holds, and the row keeps nothing but its SHA-256 digest.
The digest is the lookup key (the unique index on ``sessions.token_hash``), so
the presented cookie is hashed first and found second.

``SESSION_TOKEN_HASH_PATTERN`` is imported by the model and embedded in a CHECK
constraint, which is deliberate: the shape the database will accept and the
shape ``hash_session_token`` produces cannot drift, because they are the same
string. A developer who tries to store the raw token — or an Argon2 hash, or a
truncated digest — gets an ``IntegrityError``, not a silently weaker table.

SHA-256 — not a password hash — is the right tool here. The token is 256 bits
of ``secrets`` randomness: there is nothing to brute-force and no dictionary to
slow down, so the value of a salted/slow hash is zero while its per-request
cost is not. Password hashing is a different problem; Argon2id arrives with
F026.
"""

import hashlib
import secrets

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
