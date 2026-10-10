"""Marker hygiene: the two legs of the backend gate must be a real partition (F056).

The gate runs the suite twice. `-m "not integration"` is the database-free leg
and must pass on a machine with no PostgreSQL; `-m integration` is the
PostgreSQL leg, and it *fails* — rather than skipping — when no database is
configured, because a run whose database tests all skipped and which still
exited 0 is a green light with nothing behind it.

That partition only holds if every database-backed test carries the marker and
no other test does. So this file checks both directions, for every collected
item, by asking pytest which fixtures each item actually resolves —
`item.fixturenames` is the transitive list, so `client` → `make_client` →
`session` → `test_database_url` is covered without naming any of them twice,
and a database fixture written tomorrow is covered the day it is written.

The one thing the check cannot see is a test that reaches the database without
a fixture of its own (opening its own engine). Nothing here does that today —
`sessions on their own connections <tests/test_admin_settings.py>` is a
fixture — but a new one would have to add itself here, which is why the
checker is explicit about what it knows.
"""

import pytest

# The fixtures that reach the real database, directly or through another one.
# `session` and `test_database_url` are the roots in `conftest.py`; `client`
# and `make_client` stack on `session`; `own_database` and `scratch` are
# declared in the files that need their own connection or their own app.
DATABASE_FIXTURES = frozenset(
    {"test_database_url", "session", "make_client", "client", "own_database", "scratch"}
)


def test_the_marker_partitions_the_suite(request: pytest.FixtureRequest) -> None:
    misplaced: list[str] = []
    for item in request.session.items:
        if not isinstance(item, pytest.Function):
            continue
        needs_database = bool(DATABASE_FIXTURES & set(item.fixturenames))
        marked = item.get_closest_marker("integration") is not None
        if needs_database and not marked:
            misplaced.append(
                f"{item.nodeid}: resolves a database fixture but is not marked "
                "`integration`, so the database-free leg would run it and fail"
            )
        elif marked and not needs_database:
            misplaced.append(
                f"{item.nodeid}: marked `integration` but resolves no database "
                "fixture, so the PostgreSQL leg would need a database for nothing"
            )
    assert not misplaced, "Marker hygiene:\n  " + "\n  ".join(misplaced)
