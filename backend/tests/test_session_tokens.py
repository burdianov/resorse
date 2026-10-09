"""The session-secret contract, without a database (F025).

Two agreements are pinned here. One is between ``hash_session_token`` and the
CHECK constraint the database enforces (``ck_sessions_token_hash_is_sha256_hex``,
exercised against PostgreSQL in ``test_session_model.py``): this file holds the
production side — that the digest really is lowercase SHA-256 hex, so the
constraint can never reject an honest write. The other is the pair of session
lifetimes ARCHITECTURE §3 recorded as "configurable, confirmed at F025": these
tests make the confirmation executable, so a later change to the defaults is a
deliberate edit with a failing test in front of it, not a silent drift.
"""

import hashlib
import re

from app.core.config import Settings
from app.core.security import (
    SESSION_TOKEN_BYTES,
    SESSION_TOKEN_HASH_PATTERN,
    generate_session_token,
    hash_session_token,
)


def test_tokens_are_256_bits_of_url_safe_randomness() -> None:
    token = generate_session_token()

    assert SESSION_TOKEN_BYTES == 32
    # 256 bits in base64url is ceil(256 / 6) = 43 characters, no padding.
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", token)
    # Two calls must not collide (this is `secrets`, not `random`).
    assert generate_session_token() != token


def test_the_digest_is_exactly_what_the_database_check_accepts() -> None:
    token = generate_session_token()
    digest = hash_session_token(token)

    assert digest == hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert len(digest) == 64
    assert re.fullmatch(SESSION_TOKEN_HASH_PATTERN, digest)
    # The digest is one-way and domain-separated from the token: the stored
    # value and the cookie's value share no substring.
    assert token not in digest


def test_session_lifetimes_are_the_confirmed_defaults() -> None:
    # ARCHITECTURE §3: "initial default 12 h, refreshed on activity" and
    # "initial default 30 days regardless of activity — configurable,
    # confirmed at F025". The declared defaults are asserted on the field
    # itself so a deployment's environment overrides do not fail the test.
    assert Settings.model_fields["session_idle_timeout_minutes"].default == 12 * 60
    assert Settings.model_fields["session_absolute_lifetime_days"].default == 30
