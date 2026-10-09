"""The bootstrap CLI's refusals and its one success path (F027).

The acceptance is "no default credentials tests", so the centre of this file
is what the CLI **refuses to do**: with no password source it exits 2 having
touched nothing — proven with a session factory that raises if it is ever
called, not merely by inspecting the database afterwards. A weak or
denylisted password, an email the API's own validator would reject, and a
mismatched prompt confirmation all fail the same way: before the database.

The success paths run through ``await main(...)`` with an injected factory
that lends the CLI the rollback-fixture session (and exposes the created row
after the CLI's commit, so the test can verify what was written). The fixture
still rolls everything back — the CLI commits a savepoint, not the data — so
no test here needs the committed-row exception F026's concurrency test
required.

``env={}`` in these tests means exactly what it says: **no BOOTSTRAP_*
variables**, .env file included. The database URL still comes from the
process environment the fixture prepared.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap_admin import (
    EMAIL_ENV_VAR,
    PASSWORD_ENV_VAR,
    BootstrapRefused,
    bootstrap_super_admin,
    main,
)
from app.core.permissions import ALL_PERMISSION_CODES
from app.core.security import GENERATED_PASSWORD_LENGTH, verify_password
from app.models import Role, User
from app.models.identity import user_roles
from app.seed import SUPER_ADMIN_ROLE_NAME

STRONG = "correct horse battery staple"
EMAIL = "ada@example.com"


def forbidden_factory():
    """A session factory that must never be called — the proof that a refusal
    happens *before* the database stage, not one query into it."""
    raise AssertionError("the CLI reached the database it was supposed to refuse before")


def lending_factory(session: AsyncSession, *, email: str = EMAIL):
    """Lend ``main`` the fixture session. After the CLI's commit returns, the
    context resumes and captures the row for assertions — same loop, same
    transaction, rolled back by the fixture at test end."""
    captured: dict[str, User | None] = {}

    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncSession]:
        yield session
        captured["user"] = await session.scalar(select(User).where(User.email == email))

    return factory, captured


def password_from_output(stdout: str) -> str:
    """The generated password is the line under the shown-once banner."""
    lines = stdout.splitlines()
    banner = next(i for i, line in enumerate(lines) if "shown exactly once" in line)
    return lines[banner + 1].strip()


async def user_count(session: AsyncSession) -> int:
    return await session.scalar(select(func.count()).select_from(User)) or 0


# --- the transactional core, against real PostgreSQL --------------------------


@pytest.mark.asyncio
async def test_bootstrap_creates_the_superuser_with_a_verified_hash(session) -> None:
    outcome = await bootstrap_super_admin(session, email="Ada@Example.COM ", password=STRONG)

    user = await session.scalar(select(User).where(User.email == EMAIL))
    assert user is not None
    assert outcome.email == EMAIL  # canonicalised despite the messy input
    assert user.email == EMAIL
    assert user.full_name == "Administrator"
    assert user.is_superuser is True
    assert user.is_active is True
    assert user.is_deleted is False
    assert user.must_change_password is True  # it is a temporary credential
    assert STRONG not in user.hashed_password
    assert verify_password(STRONG, user.hashed_password)

    role_names = await session.scalars(
        select(Role.name)
        .join(user_roles, user_roles.c.role_id == Role.id)
        .where(user_roles.c.user_id == user.id)
    )
    assert set(role_names.all()) == {SUPER_ADMIN_ROLE_NAME}
    # The seed ran inside the same transaction — the grant could not exist
    # otherwise — which is what makes "seed, then grant" atomic.
    assert outcome.seed_report.permissions_created == len(ALL_PERMISSION_CODES)


@pytest.mark.asyncio
async def test_a_second_bootstrap_is_refused(session) -> None:
    await bootstrap_super_admin(session, email=EMAIL, password=STRONG)

    with pytest.raises(BootstrapRefused, match="super-admin already exists"):
        await bootstrap_super_admin(session, email="second@example.com", password=STRONG)

    assert await user_count(session) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "retirement",
    [{"is_active": False}, {"is_deleted": True}],
    ids=["inactive", "deleted"],
)
async def test_a_retired_superuser_does_not_block_bootstrap(session, retirement) -> None:
    # Fail-closed login means a retired superuser cannot sign in; blocking on
    # one would strand the operator with no recovery path (admin reset needs
    # an admin who can log in).
    session.add(
        User(
            email="retired@example.com",
            full_name="Retired Admin",
            hashed_password="$argon2id$placeholder",
            is_superuser=True,
            **retirement,
        )
    )
    await session.flush()

    outcome = await bootstrap_super_admin(session, email=EMAIL, password=STRONG)

    assert outcome.email == EMAIL
    assert await user_count(session) == 2


@pytest.mark.asyncio
async def test_an_existing_email_is_never_escalated_or_reset(session) -> None:
    session.add(User(email=EMAIL, full_name="Ada", hashed_password="$argon2id$placeholder"))
    await session.flush()

    with pytest.raises(BootstrapRefused, match="already exists"):
        await bootstrap_super_admin(session, email=EMAIL, password=STRONG)

    user = await session.scalar(select(User).where(User.email == EMAIL))
    assert user.is_superuser is False
    assert user.hashed_password == "$argon2id$placeholder"  # untouched


@pytest.mark.asyncio
async def test_the_core_refuses_a_weak_password(session) -> None:
    # The CLI pre-checks this without a database; the core enforces it again
    # so a programmatic caller gets the same guarantee.
    with pytest.raises(BootstrapRefused, match="does not meet policy"):
        await bootstrap_super_admin(session, email=EMAIL, password="password")

    assert await user_count(session) == 0


# --- the CLI's refusal paths (no database is allowed to be reached) -----------


@pytest.mark.asyncio
async def test_without_a_password_source_the_cli_creates_nothing(capsys) -> None:
    exit_code = await main(
        ["--email", EMAIL],
        env={},
        interactive=False,
        session_factory=forbidden_factory,
    )

    assert exit_code == 2
    stderr = capsys.readouterr().err
    assert "There is no default password." in stderr
    assert "Nothing was created." in stderr


@pytest.mark.asyncio
async def test_without_an_email_the_cli_creates_nothing(capsys) -> None:
    exit_code = await main(
        [],
        env={PASSWORD_ENV_VAR: STRONG},
        interactive=False,
        session_factory=forbidden_factory,
    )

    assert exit_code == 2
    assert "No email address" in capsys.readouterr().err


@pytest.mark.asyncio
async def test_the_cli_refuses_a_weak_password_before_the_database(capsys) -> None:
    exit_code = await main(
        [],
        env={EMAIL_ENV_VAR: EMAIL, PASSWORD_ENV_VAR: "password"},
        interactive=False,
        session_factory=forbidden_factory,
    )

    assert exit_code == 2
    stderr = capsys.readouterr().err
    assert "at least 12" in stderr
    assert "common-password lists" in stderr


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_email",
    ["admin@example.invalid", "not-an-email", "a@b"],
    ids=["special-use-domain", "no-at-sign", "no-tld"],
)
async def test_the_cli_refuses_an_email_the_api_would_also_reject(bad_email, capsys) -> None:
    # The same validator F033's API will use (Pydantic EmailStr): a CLI that
    # accepted more than the API would be a trap.
    exit_code = await main(
        [],
        env={EMAIL_ENV_VAR: bad_email, PASSWORD_ENV_VAR: STRONG},
        interactive=False,
        session_factory=forbidden_factory,
    )

    assert exit_code == 2
    assert "not a valid email address" in capsys.readouterr().err


@pytest.mark.asyncio
async def test_the_cli_refuses_a_mismatched_prompt_confirmation(capsys) -> None:
    secrets = iter(["first-value-here", "second-value-here"])
    exit_code = await main(
        [],
        env={},
        interactive=True,
        ask=lambda _prompt: EMAIL,
        ask_secret=lambda _prompt: next(secrets),
        session_factory=forbidden_factory,
    )

    assert exit_code == 2
    assert "do not match" in capsys.readouterr().err


# --- the CLI's success paths, over the rollback fixture -----------------------


@pytest.mark.asyncio
async def test_the_cli_prints_a_generated_password_exactly_once(session, capsys) -> None:
    factory, captured = lending_factory(session)

    exit_code = await main(
        ["--email", EMAIL, "--generate-password"],
        env={},
        interactive=False,
        session_factory=factory,
    )

    assert exit_code == 0
    out = capsys.readouterr().out
    password = password_from_output(out)
    assert len(password) == GENERATED_PASSWORD_LENGTH
    assert out.count(password) == 1  # shown exactly once — it is temporary

    user = captured["user"]
    assert user is not None
    assert verify_password(password, user.hashed_password)
    assert user.must_change_password is True
    assert "Seed applied:" in out
    assert f"Created super-admin {EMAIL}" in out
    assert "must change this password at first login" in out


@pytest.mark.asyncio
async def test_the_cli_uses_environment_credentials_without_echoing_them(session, capsys) -> None:
    factory, captured = lending_factory(session)

    exit_code = await main(
        [],
        env={EMAIL_ENV_VAR: "Ada@Example.com", PASSWORD_ENV_VAR: STRONG},
        interactive=False,
        session_factory=factory,
    )

    assert exit_code == 0
    out = capsys.readouterr().out
    assert STRONG not in out  # a supplied secret is never echoed
    assert PASSWORD_ENV_VAR in out  # the "remove it from .env" reminder

    user = captured["user"]
    assert user is not None
    assert user.email == EMAIL  # the env email is canonicalised too
    assert verify_password(STRONG, user.hashed_password)


@pytest.mark.asyncio
async def test_the_cli_prompts_when_interactive(session, capsys) -> None:
    factory, captured = lending_factory(session)
    secrets = iter([STRONG, STRONG])

    exit_code = await main(
        [],
        env={},
        interactive=True,
        ask=lambda _prompt: EMAIL,
        ask_secret=lambda _prompt: next(secrets),
        session_factory=factory,
    )

    assert exit_code == 0
    assert STRONG not in capsys.readouterr().out

    user = captured["user"]
    assert user is not None
    assert verify_password(STRONG, user.hashed_password)


@pytest.mark.asyncio
async def test_generate_password_wins_over_an_environment_password(session, capsys) -> None:
    factory, captured = lending_factory(session)

    exit_code = await main(
        ["--email", EMAIL, "--generate-password"],
        env={PASSWORD_ENV_VAR: STRONG},
        interactive=False,
        session_factory=factory,
    )

    assert exit_code == 0
    out = capsys.readouterr().out
    password = password_from_output(out)
    assert password != STRONG

    user = captured["user"]
    assert user is not None
    assert verify_password(password, user.hashed_password)
    assert verify_password(STRONG, user.hashed_password) is False
