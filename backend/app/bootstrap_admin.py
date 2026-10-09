"""The one-time super-admin bootstrap (F027; BP-0.7, BP-11.3).

The recovery path for a locked-out platform is an admin password reset
(BP-7.1c) — and that path needs an admin. So exactly once, an operator runs
this CLI to create the first account; everything after that goes through the
admin UI (F033) like any other account. There is **no default credential**:
the password comes from the operator (an environment variable or a hidden
prompt) or from ``generate_password``, and with no source at all the command
refuses and writes nothing. That refusal is the acceptance criterion
("no default credentials tests") tested in ``tests/test_bootstrap_admin.py``.

Decisions this module embodies (recorded as ``DECISIONS.md`` C15):

- **Three password sources, in precedence**: ``--generate-password`` (printed
  exactly once — it is a temporary credential), ``BOOTSTRAP_ADMIN_PASSWORD``,
  an interactive hidden prompt (entered twice). Never a ``--password`` flag:
  a command-line argument lands in shell history and the process list.
- **The environment is read by this CLI only** — via ``python-dotenv``, not
  through ``Settings`` — so a ``BOOTSTRAP_ADMIN_PASSWORD`` sitting in ``.env``
  (as ``.env.example`` documents) never loads into the API process, and the
  promise "not read by the app at runtime" stays literally true.
- **The same email validator the API will use** (Pydantic ``EmailStr`` /
  ``email-validator``). A CLI that accepts an address F033 rejects would be a
  trap; special-use domains like ``.invalid`` are refused here for the same
  reason they will be refused there. The address is canonicalised to
  lowercase before insert (the database's CHECK is what makes it stick).
- **Every password runs the F026 policy** before anything is hashed — the
  generated one too, because the uniform path is the rule. Violations print
  to stderr and nothing is written.
- **One-time means one-time**: if any *active, non-deleted* superuser exists,
  or the email is already taken in any state, this refuses and changes
  nothing — no second superuser, no escalating an existing account, no
  password reset through the back door. An inactive or deleted superuser does
  not block (fail-closed login means it cannot log in; blocking on it would
  strand the operator with no recovery path at all).
- **Concurrent first runs serialise** on ``pg_advisory_xact_lock`` — the
  guards above are check-then-act, and the lock closes that window. The hard
  invariants stay the database's (``ix_users_email`` is unique regardless).

The created account is ``is_superuser=True`` **and** holds the seeded
``super_admin`` role: the flag is the explicit super-admin handling the access
model already evaluates, the role makes the grant visible and revocable in
the F036 matrix, and ``must_change_password=True`` marks the operator-supplied
password for what it is — a temporary credential (BP-6.1b; the forced-change
flow itself arrives with F030/F032).

``bootstrap_super_admin`` is the transactional core (caller owns the
transaction); ``main`` is the CLI shell — argument parsing, input resolution,
one commit, human-readable output, exit codes 0/1/2. ``main`` is **async**
(the work below it is), and ``__main__`` wraps it in ``asyncio.run``; the
tests therefore drive ``await main(...)`` on the same event loop as their
database fixture, which is what lets the refusal paths be proven not to touch
the database at all.
"""

import argparse
import asyncio
import getpass
import os
import sys
import uuid
from collections.abc import Callable, Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass

from dotenv import dotenv_values
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, insert, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ENV_FILE
from app.core.database import dispose_engine, get_sessionmaker
from app.core.security import (
    generate_password,
    hash_password,
    password_policy_violations,
)
from app.models import Role, User
from app.models.identity import user_roles
from app.seed import SUPER_ADMIN_ROLE_NAME, SeedReport, seed

EMAIL_ENV_VAR = "BOOTSTRAP_ADMIN_EMAIL"
PASSWORD_ENV_VAR = "BOOTSTRAP_ADMIN_PASSWORD"

DEFAULT_FULL_NAME = "Administrator"

# One fixed key — the ASCII of "resors" — shared by every process that could
# race this command. Advisory locks are per-database and released at
# transaction end, which is exactly the lifetime needed.
BOOTSTRAP_LOCK_KEY = 0x7265736F7273

_EMAIL_ADAPTER: TypeAdapter[EmailStr] = TypeAdapter(EmailStr)


class BootstrapRefused(RuntimeError):
    """The database state refuses the bootstrap. Nothing was committed."""


@dataclass(frozen=True)
class BootstrapOutcome:
    """What ``bootstrap_super_admin`` created. Never contains a password."""

    user_id: uuid.UUID
    email: str
    full_name: str
    role_name: str
    seed_report: SeedReport


async def bootstrap_super_admin(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    full_name: str = DEFAULT_FULL_NAME,
) -> BootstrapOutcome:
    """Create the one super-admin account, or refuse. Caller commits.

    Policy is enforced here as well as in the CLI: this function is the
    transactional core, and a programmatic caller gets the same guarantees as
    the operator does.
    """
    canonical_email = email.strip().lower()
    if not canonical_email or "@" not in canonical_email:
        raise BootstrapRefused(f"{email!r} is not a valid email address.")

    display_name = full_name.strip()
    if not display_name:
        raise BootstrapRefused("The full name is empty.")

    violations = password_policy_violations(password, email=canonical_email)
    if violations:
        raise BootstrapRefused("The password does not meet policy: " + " ".join(violations))

    # Serialise concurrent first runs; released when the transaction ends.
    await session.execute(select(func.pg_advisory_xact_lock(BOOTSTRAP_LOCK_KEY)))

    # The account needs its role, and "seed, then grant" must be one atomic
    # act — the same transaction is the only honest way to say that.
    report = await seed(session)

    existing_superuser = await session.scalar(
        select(User.email)
        .where(
            User.is_superuser.is_(True),
            User.is_active.is_(True),
            User.is_deleted.is_(False),
        )
        .limit(1)
    )
    if existing_superuser is not None:
        raise BootstrapRefused(
            f"A super-admin already exists ({existing_superuser}); this command "
            "runs once. Further accounts are created in the admin UI (F033).",
        )

    existing_user = await session.scalar(select(User.email).where(User.email == canonical_email))
    if existing_user is not None:
        raise BootstrapRefused(
            f"A user with the email {canonical_email} already exists; nothing "
            "was changed. The bootstrap never resets or escalates an existing "
            "account — that is the admin UI's job.",
        )

    user = User(
        email=canonical_email,
        full_name=display_name,
        hashed_password=hash_password(password),
        is_superuser=True,
        must_change_password=True,
    )
    session.add(user)
    await session.flush()

    role_id = await session.scalar(select(Role.id).where(Role.name == SUPER_ADMIN_ROLE_NAME))
    if role_id is None:  # seed() above guarantees it; fail loudly if that breaks
        raise RuntimeError(f"seed() did not provide the {SUPER_ADMIN_ROLE_NAME} role.")
    await session.execute(insert(user_roles).values(user_id=user.id, role_id=role_id))

    return BootstrapOutcome(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role_name=SUPER_ADMIN_ROLE_NAME,
        seed_report=report,
    )


# --- CLI -----------------------------------------------------------------------


def _bootstrap_environment() -> dict[str, str]:
    """Real environment variables, with ``.env`` values underneath.

    Same precedence as ``Settings`` (the environment wins), but parsed here
    and not exported: the API process must never see these values.
    """
    values = {key: value for key, value in dotenv_values(ENV_FILE).items() if value is not None}
    values.update(os.environ)
    return values


async def main(
    argv: Sequence[str] | None = None,
    *,
    env: Mapping[str, str] | None = None,
    interactive: bool | None = None,
    ask: Callable[[str], str] | None = None,
    ask_secret: Callable[[str], str] | None = None,
    session_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]] | None = None,
) -> int:
    """Run the bootstrap. Returns the process exit code: 0 ok, 1 refused by
    database state, 2 bad operator input (nothing is written in either failure
    case). ``env``/``interactive``/``ask``/``session_factory`` exist so tests
    can drive the refusal paths without a terminal or a database."""
    parser = argparse.ArgumentParser(
        prog="python -m app.bootstrap_admin",
        description=(
            "Create the one-time super-admin account and seed the default "
            "roles and permissions. Refuses to run when a super-admin already "
            "exists — there is no default credential."
        ),
        epilog=(
            f"Password sources, in order: --generate-password; {PASSWORD_ENV_VAR} "
            "(environment or .env); an interactive prompt. Without a source the "
            "command refuses and creates nothing."
        ),
    )
    parser.add_argument(
        "--email",
        help=f"Super-admin email. Falls back to {EMAIL_ENV_VAR}, then a prompt.",
    )
    parser.add_argument(
        "--full-name",
        default=None,
        help=f"Display name (default: {DEFAULT_FULL_NAME!r}).",
    )
    parser.add_argument(
        "--generate-password",
        action="store_true",
        help=(
            "Generate a strong password and print it exactly once. Wins over "
            f"{PASSWORD_ENV_VAR}; never prompts."
        ),
    )
    args = parser.parse_args(argv)

    environment: Mapping[str, str] = _bootstrap_environment() if env is None else env
    is_interactive = sys.stdin.isatty() if interactive is None else interactive
    ask_text = input if ask is None else ask
    ask_hidden = getpass.getpass if ask_secret is None else ask_secret

    email_candidate = args.email or environment.get(EMAIL_ENV_VAR)
    if not email_candidate and is_interactive:
        email_candidate = ask_text("Super-admin email: ")
    if not email_candidate:
        print(
            f"No email address: pass --email, set {EMAIL_ENV_VAR}, or run interactively.",
            file=sys.stderr,
        )
        print("Nothing was created.", file=sys.stderr)
        return 2
    try:
        email = str(_EMAIL_ADAPTER.validate_python(email_candidate)).strip().lower()
    except ValidationError:
        print(f"{email_candidate!r} is not a valid email address.", file=sys.stderr)
        print("Nothing was created.", file=sys.stderr)
        return 2

    password_source: str
    if args.generate_password:
        password = generate_password()
        password_source = "generated"
    else:
        from_environment = environment.get(PASSWORD_ENV_VAR)
        if from_environment:
            password, password_source = from_environment, "environment"
        elif is_interactive:
            first = ask_hidden("Password: ")
            second = ask_hidden("Repeat password: ")
            if first != second:
                print("The passwords do not match.", file=sys.stderr)
                print("Nothing was created.", file=sys.stderr)
                return 2
            password, password_source = first, "prompted"
        else:
            print(
                "No password: pass --generate-password, set "
                f"{PASSWORD_ENV_VAR} (environment or .env), or run "
                "interactively. There is no default password.",
                file=sys.stderr,
            )
            print("Nothing was created.", file=sys.stderr)
            return 2

    violations = password_policy_violations(password, email=email)
    if violations:
        for violation in violations:
            print(violation, file=sys.stderr)
        print("Nothing was created.", file=sys.stderr)
        return 2

    full_name = args.full_name or DEFAULT_FULL_NAME

    owns_engine = session_factory is None
    factory = get_sessionmaker() if session_factory is None else session_factory
    try:
        outcome = await _run_bootstrap(
            factory,
            email=email,
            password=password,
            full_name=full_name,
        )
    except BootstrapRefused as refusal:
        print(f"Refused: {refusal}", file=sys.stderr)
        print("Nothing was created.", file=sys.stderr)
        return 1
    except (RuntimeError, OSError, SQLAlchemyError) as error:
        # The failure classes an operator actually hits: no DATABASE_URL, no
        # database, no permission. A TypeError-shaped bug still gets its
        # traceback — masking it as "nothing was created" would hide a defect.
        print(f"Bootstrap failed: {error}", file=sys.stderr)
        print("Nothing was created.", file=sys.stderr)
        return 1
    finally:
        if owns_engine:
            await dispose_engine()

    for line in outcome.seed_report.summary_lines():
        print(line)
    print(f"Created super-admin {outcome.email} ({outcome.full_name}), role {outcome.role_name}.")
    if password_source == "generated":
        print("Generated password (shown exactly once — record it in LOCAL_CREDENTIALS.md now):")
        print(f"    {password}")
    if password_source == "environment":
        print(
            f"Remember to remove {PASSWORD_ENV_VAR} from .env now that the "
            "account exists, and to record the password in LOCAL_CREDENTIALS.md.",
        )
    print(
        "The account must change this password at first login "
        "(must_change_password; the forced-change flow arrives with F030/F032).",
    )
    return 0


async def _run_bootstrap(
    factory: Callable[[], AbstractAsyncContextManager[AsyncSession]],
    *,
    email: str,
    password: str,
    full_name: str,
) -> BootstrapOutcome:
    async with factory() as session:
        outcome = await bootstrap_super_admin(
            session, email=email, password=password, full_name=full_name
        )
        await session.commit()
        return outcome


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
