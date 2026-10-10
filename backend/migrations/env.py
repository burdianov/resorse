"""Alembic environment — async engine, one source of truth for the URL.

Why the URL is not in ``alembic.ini``: that file is committed and a database
URL contains a password. The engine comes from ``app.core.database``, which
reads ``DATABASE_URL`` from the environment, so ``alembic upgrade head`` and
the application always point at the same database.

``target_metadata`` is ``Base.metadata`` from the same module, so autogenerate
compares against the conventions every model is built with (UUID primary keys,
``timestamptz`` instants, named constraints). ``app.models`` is imported for
its side effect: a model that is never imported is invisible to autogenerate,
and the failure mode is a migration that silently omits a table.

``compare_type=True`` makes autogenerate notice a column whose type changed.
``compare_server_default`` is left off: PostgreSQL rewrites several defaults
(``now()``, casts, function calls) into forms that never compare equal, and the
resulting false positives would train everyone to ignore the check.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.core.database import Base, get_engine

config = context.config

if config.config_file_name is not None:
    # disable_existing_loggers=False: the application's loggers exist before a
    # migration runs (F060). The default would silence them for the rest of the process.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting (``alembic upgrade head --sql``)."""
    context.configure(
        url=get_engine().url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = get_engine()
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    # A migration is a short-lived process; hand the connections back rather
    # than waiting for the pool to be garbage-collected.
    await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
