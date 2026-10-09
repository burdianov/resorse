"""The password contract, without a database (F026; the generator is F027).

"Unit tests no plaintext" is the acceptance, so the assertions are literal:
nothing that leaves ``hash_password`` contains the password, a model's repr
cannot print it, and a policy message cannot repeat it. The rest pins what a
later change must not silently move — the reviewed Argon2 parameters, every
policy rule, the malformed-row behaviour that verification depends on, the
confirmed default bounds (the same pattern F025 used for session lifetimes),
and the properties of ``generate_password``, the shown-once credential the
bootstrap CLI and F033's account creation both hand out.
"""

import string

import pytest

from app.core.config import Settings
from app.core.security import (
    ARGON2_PARAMETERS,
    COMMON_PASSWORDS,
    GENERATED_PASSWORD_ALPHABET,
    GENERATED_PASSWORD_LENGTH,
    Argon2Parameters,
    build_password_hasher,
    generate_password,
    hash_password,
    password_needs_rehash,
    password_policy_violations,
    verify_password,
)
from app.models import User

PASSWORD = "correct horse battery staple"

# Cheap parameters for tests: hashing happens a dozen times here and every
# second of it would be Argon2 doing its job. Safe because verification reads
# the parameters from the *stored string*, not from the hasher — which is
# itself asserted below.
CHEAP = build_password_hasher(Argon2Parameters(time_cost=1, memory_cost_kib=8, parallelism=1))


def test_a_hash_is_argon2id_with_the_reviewed_parameters() -> None:
    hashed = hash_password(PASSWORD, hasher=CHEAP)

    # The self-describing string is the migration path: parameters change by
    # changing this profile, and old rows keep verifying because their
    # parameters travel with them.
    assert hashed.startswith("$argon2id$v=19$")
    assert "m=8,t=1,p=1" in hashed

    # The shipped profile itself is pinned, not just whatever the hasher says.
    assert ARGON2_PARAMETERS.memory_cost_kib == 19_456
    assert ARGON2_PARAMETERS.time_cost == 2
    assert ARGON2_PARAMETERS.parallelism == 1


def test_the_password_never_appears_in_the_stored_value() -> None:
    hashed = hash_password(PASSWORD, hasher=CHEAP)

    assert hashed != PASSWORD
    assert PASSWORD not in hashed
    # Salted per row: the same password twice is two unrelated strings.
    assert hash_password(PASSWORD, hasher=CHEAP) != hashed


def test_verification_tells_matches_from_mismatches() -> None:
    hashed = hash_password(PASSWORD, hasher=CHEAP)

    assert verify_password(PASSWORD, hashed, hasher=CHEAP) is True
    assert verify_password(PASSWORD + "!", hashed, hasher=CHEAP) is False
    assert verify_password("", hashed, hasher=CHEAP) is False


def test_verification_honours_the_parameters_stored_in_the_string() -> None:
    # A weak hash verified with the *default* hasher still matches: the
    # parameters travel with the stored value. This is why the test seam
    # (cheap parameters here, the real profile in production) changes nothing
    # about what is being tested.
    weak = hash_password(PASSWORD, hasher=CHEAP)

    assert verify_password(PASSWORD, weak) is True
    assert password_needs_rehash(weak) is True
    assert password_needs_rehash(weak, hasher=CHEAP) is False


def test_an_unusable_row_fails_verification_instead_of_raising() -> None:
    for broken in ("not-a-hash", "", "$argon2id$truncated"):
        assert verify_password(PASSWORD, broken) is False
    # And it must be replaced, not trusted.
    for broken in ("not-a-hash", "$argon2id$truncated"):
        assert password_needs_rehash(broken) is True

    assert password_needs_rehash(hash_password(PASSWORD, hasher=CHEAP), hasher=CHEAP) is False


def test_the_user_repr_cannot_print_the_hash() -> None:
    hashed = hash_password(PASSWORD, hasher=CHEAP)
    user = User(email="ada@example.com", full_name="Ada Lovelace", hashed_password=hashed)

    shown = repr(user)
    assert hashed not in shown
    assert "hashed_password" not in shown
    # Still a useful repr: identity is what debugging needs.
    assert "ada@example.com" in shown


def test_the_confirmed_policy_defaults_are_what_ships() -> None:
    fields = Settings.model_fields
    assert fields["password_min_length"].default == 12
    assert fields["password_max_length"].default == 128
    assert fields["login_max_attempts"].default == 5
    assert fields["login_attempt_window_minutes"].default == 15


def test_length_bounds_are_both_enforced() -> None:
    assert password_policy_violations("short", min_length=12, max_length=128) == [
        "Password must be at least 12 characters long."
    ]
    assert password_policy_violations("x" * 12, min_length=12, max_length=128) == []
    assert password_policy_violations("x" * 129, min_length=12, max_length=128) == [
        "Password must be at most 128 characters long."
    ]


def test_denylist_entries_are_canonical_lowercase() -> None:
    # Matching lowercases the candidate; an uppercase entry would be dead
    # weight that looks alive. The floor on size keeps silent truncation out.
    assert len(COMMON_PASSWORDS) >= 100
    assert all(entry == entry.lower() for entry in COMMON_PASSWORDS)


@pytest.mark.parametrize("candidate", ["password", "PassWord", "P@ssw0rd", "qwerty12345"])
def test_common_passwords_are_rejected_regardless_of_case(candidate: str) -> None:
    violations = password_policy_violations(candidate, min_length=1, max_length=128)

    assert any("common-password lists" in message for message in violations)


def test_policy_messages_never_echo_the_candidate() -> None:
    # Candidates chosen so they cannot collide with the English words in the
    # messages ("password", "common-password"): if one appears, it was echoed.
    for candidate in ("P@ssw0rd", "qwerty12345", "letmein123"):
        violations = password_policy_violations(candidate, min_length=1, max_length=128)
        assert violations, candidate
        assert all(candidate not in message for message in violations), candidate

    email_violations = password_policy_violations(
        "ada@example.com", email="ada@example.com", min_length=1, max_length=128
    )
    assert email_violations
    assert all("example.com" not in message for message in email_violations)


def test_passwords_based_on_the_email_are_rejected() -> None:
    email = "ada@example.com"

    for candidate in (email, "ada", "Ada"):
        violations = password_policy_violations(
            candidate, email=email, min_length=1, max_length=128
        )
        assert any("email address" in message for message in violations), candidate

    # An unrelated password passes even with the email supplied.
    assert (
        password_policy_violations(
            "correct horse battery staple", email=email, min_length=1, max_length=128
        )
        == []
    )


def test_edge_whitespace_is_rejected_but_internal_spaces_are_fine() -> None:
    violations = password_policy_violations(" abcdefghijk ", min_length=1, max_length=128)
    assert violations == ["Password cannot start or end with whitespace."]

    assert password_policy_violations("abc defghijk", min_length=1, max_length=128) == []


def test_every_broken_rule_is_reported_in_one_pass() -> None:
    # Short *and* common: a form should be able to show both at once.
    violations = password_policy_violations("password", min_length=12, max_length=128)

    assert len(violations) == 2
    assert any("at least 12" in message for message in violations)
    assert any("common-password lists" in message for message in violations)


def test_hashing_does_not_validate() -> None:
    # Policy is the API boundary's job (F033/F042 runs it before hashing);
    # the mechanical function stays mechanical, so the layering is visible in
    # the code rather than implied by it.
    assert hash_password("", hasher=CHEAP).startswith("$argon2id$")
    assert password_policy_violations("") != []


def test_rule_defaults_come_from_settings() -> None:
    settings = Settings()

    # Same verdict either way — defaults and explicit bounds must agree.
    assert password_policy_violations("x" * 11) == password_policy_violations(
        "x" * 11, min_length=settings.password_min_length
    )


def test_generated_passwords_are_random_and_transcribable() -> None:
    passwords = [generate_password() for _ in range(50)]

    assert all(len(password) == GENERATED_PASSWORD_LENGTH for password in passwords)
    assert len(set(passwords)) == 50  # `secrets`, not a wordlist
    # Human-transcribable alphabet: alphanumerics, minus the characters that
    # are ambiguous in the fonts a console tends to use.
    assert set(GENERATED_PASSWORD_ALPHABET) <= set(string.ascii_letters + string.digits)
    assert not set("Il1O0") & set(GENERATED_PASSWORD_ALPHABET)


def test_generated_passwords_pass_the_policy_they_will_be_checked_against() -> None:
    # The bootstrap CLI runs the policy on the generated value like any other
    # password (the uniform path is the rule); this is the proof it always will.
    for _ in range(20):
        assert password_policy_violations(generate_password(), email="ada@example.com") == []


def test_generate_password_takes_a_length_and_refuses_a_silly_one() -> None:
    assert len(generate_password(length=32)) == 32
    with pytest.raises(ValueError):
        generate_password(length=0)
