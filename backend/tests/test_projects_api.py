"""Projects API (D008): the guards, the CRUD, and the status field.

The task's acceptance is **status permission tests**, and that phrase is two
claims this file proves separately:

- **The status is a field, guarded by a code.** `projects.update` is what moves
  a project between `tender`, `awarded` and `retired`; a caller with only
  `projects.read` gets the list and the detail and a 403 from every write. The
  three codes are separate (§3's matrix — not the reference tables' `read`/
  `manage` pair), so the tests below pin each of the three to exactly the
  routes it opens, including that `projects.create` does not imply
  `projects.update` and that `projects.update` does not imply `projects.read`.
- **The status moves freely, because D008 owns the field and not the
  conversion.** `patch {"status": "awarded"}` is an ordinary edit here — C57's
  award (a second row, the tender retired, the plan copied, one award only) is
  D033's own conversion on its own route. There is deliberately no test that
  refuses a transition, because refusing one would be the second implementation
  of D033's rule that this revision does not have.

The rest is the ordinary contract, carried over from the reference tables: the
code is the identity and cannot be edited, an unknown id is a 404, a duplicate
live code is a 409 while a *retired* code is free again (D007's partial index),
a completion before the start is a field-addressable 422 rather than a
`CheckViolation` the caller reads as a 500, an empty edit is a 400, and every
mutation lands in the audit trail with its diff while a refused one leaves no
event. The pure tests at the top need no database and carry no marker —
`tests/test_markers.py` fails in both directions.

What is **not** tested here, because it cannot happen yet: the 409 a delete
raises when something still references the project. Nothing in this revision
carries a `project_id` — that arm arrives with D019's memberships and D020's
forecasts, and the service documents it as unreachable rather than pretending
otherwise.
"""

import uuid
from datetime import date
from typing import Any, cast, get_args

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import PERMISSION_DENIED_DETAIL
from app.api.v1.projects import SortField
from app.core.cookies import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import AuditLog, Permission, Role, User
from app.models.projects import PROJECT_STATUSES
from app.schemas.projects import (
    CreateProjectRequest,
    ProjectItem,
    ProjectStatus,
    UpdateProjectRequest,
)
from app.services.projects import SORTABLE_FIELDS

PROJECTS = "/api/v1/projects"
PASSWORD = "correct horse battery staple"

# A body the create route accepts, for the tests that only care that the *guard*
# answered first (401/403) — the values never reach the service.
CREATE_BODY: dict[str, Any] = {
    "code": "P-1001",
    "name": "Riverside Tower",
    "start_date": "2026-01-05",
    "contractual_completion": "2027-03-31",
    "forecast_completion": "2027-05-15",
}


# --- pure: the decisions the shapes make --------------------------------------


def test_the_status_literal_mirrors_the_model() -> None:
    """`PROJECT_STATUSES` generates D007's CHECK and the partial index's
    predicate; `ProjectStatus` is the schema's literal and the third reader of
    the same vocabulary. A fourth state therefore has to be added in both places
    or fail here — which is the point, since one side is a constraint in the
    database and the other is an enum in the generated client."""
    assert set(get_args(ProjectStatus)) == set(PROJECT_STATUSES)


def test_the_edit_shape_does_not_offer_the_code_or_the_responsible_person() -> None:
    """Two different refusals, one shape.

    The **code** is the identity and is not editable — an attempted rename is a
    422 at the unknown field (`extra="forbid"`) rather than a 200 that quietly
    did nothing. The **responsible person** is `projects.responsibility`, which
    §3 gives its own code and D019 gives its own task; this shape does not reach
    it at all, and `ProjectItem` still *reports* it because a screen has to
    render who is answerable.
    """
    assert "code" not in UpdateProjectRequest.model_fields
    assert "responsible_user_id" not in UpdateProjectRequest.model_fields
    assert "responsible_user_id" not in CreateProjectRequest.model_fields
    assert UpdateProjectRequest.model_config["extra"] == "forbid"
    assert "responsible_user_id" in ProjectItem.model_fields


def test_the_edit_shape_forbids_an_unexpected_field() -> None:
    """The reference tables' rule, kept: a caller that misspells a field, or
    tries to rename the project, gets a 422 naming it rather than a request that
    silently changed less than it meant to. (`extra="forbid"` is asserted
    directly in the test above; this is what it does with a real payload.)"""
    with pytest.raises(ValidationError) as caught:
        UpdateProjectRequest.model_validate({"code": "P-2"})
    assert caught.value.errors()[0]["type"] == "extra_forbidden"


def test_the_create_shape_defaults_the_status_and_refuses_a_reversed_pair() -> None:
    """The lifecycle starts at `tender` — PRODUCT_SPEC §4's first state — so a
    create need not say it; and a payload carrying both sides of the date pair
    is refused here, on the completion, because a typo must be a
    field-addressable 422 rather than a `CheckViolation` a client reads as a
    500. The mixed case the schema cannot see is the service's (below)."""
    created = CreateProjectRequest.model_validate(CREATE_BODY)
    assert created.status == "tender"

    with pytest.raises(ValidationError) as caught:
        CreateProjectRequest.model_validate({**CREATE_BODY, "forecast_completion": "2025-12-31"})
    assert [error["loc"] for error in caught.value.errors()] == [("forecast_completion",)]


def test_the_sort_literal_matches_the_service_allowlist() -> None:
    """The route's `Query` annotation is a static type — it cannot be built from
    the service's dict — so the two are written twice and this is what keeps the
    second copy honest. An entry that fell out of `SORTABLE_FIELDS` would
    otherwise be a `KeyError` inside the ordering helper, i.e. a 500."""
    assert set(get_args(SortField)) == set(SORTABLE_FIELDS)


# --- the callers --------------------------------------------------------------


async def add_user(session: AsyncSession, *, email: str, **overrides: Any) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0].title(),
        hashed_password=hash_password(PASSWORD),
        roles=[],
        **overrides,
    )
    session.add(user)
    await session.flush()
    return user


async def make_role(session: AsyncSession, name: str, codes: list[PermissionCode]) -> Role:
    role = Role(name=name)
    session.add(role)
    with session.no_autoflush:
        for code in codes:
            permission = await session.scalar(select(Permission).where(Permission.code == code))
            if permission is None:
                permission = Permission(code=code)
                session.add(permission)
            role.permissions.append(permission)
    await session.flush()
    return role


async def sign_in_with(
    client: httpx.AsyncClient, session: AsyncSession, codes: list[PermissionCode]
) -> User:
    user = await add_user(session, email="admin@example.com")
    if codes:
        user.roles.append(await make_role(session, "caller-role", codes))
    await session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": PASSWORD},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200, response.text
    session_cookie = next(
        header
        for header in response.headers.get_list("set-cookie")
        if header.startswith(f"{SESSION_COOKIE_NAME}=")
    )
    csrf_cookie = next(
        header
        for header in response.headers.get_list("set-cookie")
        if header.startswith(f"{CSRF_COOKIE_NAME}=")
    )
    client.cookies.clear()
    client.cookies.update(
        {
            SESSION_COOKIE_NAME: session_cookie.split("=", 1)[1].split(";", 1)[0],
            CSRF_COOKIE_NAME: csrf_cookie.split("=", 1)[1].split(";", 1)[0],
        }
    )
    client.headers[CSRF_HEADER_NAME] = csrf_cookie.split("=", 1)[1].split(";", 1)[0]
    return user


async def a_project(client: httpx.AsyncClient, **overrides: Any) -> dict[str, Any]:
    """Create a project through the API and return the response body.

    Going through the route on purpose: every test below then also proves the
    create route on the way to whatever it is really about.
    """
    response = await client.post(PROJECTS, json={**CREATE_BODY, **overrides})
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


async def audit_rows(session: AsyncSession, entity_id: str) -> list[AuditLog]:
    rows = await session.scalars(
        select(AuditLog)
        .where(AuditLog.entity_type == "project", AuditLog.entity_id == uuid.UUID(entity_id))
        .order_by(AuditLog.created_at.asc())
    )
    return list(rows)


# --- the guards ---------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_every_project_route_requires_a_session(client: httpx.AsyncClient) -> None:
    missing = uuid.uuid4()

    assert (await client.get(PROJECTS)).status_code == 401
    assert (await client.post(PROJECTS, json=CREATE_BODY)).status_code == 401
    assert (await client.get(f"{PROJECTS}/{missing}")).status_code == 401
    assert (await client.patch(f"{PROJECTS}/{missing}", json={"name": "X"})).status_code == 401
    assert (await client.delete(f"{PROJECTS}/{missing}")).status_code == 401


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_read_code_opens_the_two_reads_and_no_write(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """`projects.read` is a viewer grant (the seed holds it): the list and the
    detail, and a 403 from every mutation. This is the status test's first half
    — a read-only caller cannot move a project's lifecycle state."""
    await sign_in_with(client, session, [PermissionCode.PROJECTS_READ])
    missing = uuid.uuid4()

    assert (await client.get(PROJECTS)).status_code == 200
    created = await client.post(PROJECTS, json=CREATE_BODY)
    assert created.status_code == 403
    assert created.json()["detail"] == PERMISSION_DENIED_DETAIL
    edited = await client.patch(f"{PROJECTS}/{missing}", json={"status": "awarded"})
    assert edited.status_code == 403
    assert edited.json()["detail"] == PERMISSION_DENIED_DETAIL
    assert (await client.delete(f"{PROJECTS}/{missing}")).status_code == 403


@pytest.mark.integration
@pytest.mark.asyncio
async def test_each_write_code_opens_only_its_own_routes(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The three codes are separate, so neither implies the other.

    `projects.create` creates and cannot edit or delete; `projects.update`
    edits *and* deletes (there is no `projects.delete` — a delete is an edit of
    a row nothing depends on, which the service's docstring argues at length)
    and cannot create. Neither implies `projects.read`, which is the same
    semantics `roles.manage` has had since F035 and is pinned here so nobody
    "fixes" it into an implied pair.
    """
    await sign_in_with(client, session, [PermissionCode.PROJECTS_CREATE])
    project = await a_project(client)
    edited = await client.patch(f"{PROJECTS}/{project['id']}", json={"status": "awarded"})
    assert edited.status_code == 403
    assert (await client.delete(f"{PROJECTS}/{project['id']}")).status_code == 403
    assert (await client.get(PROJECTS)).status_code == 403
    assert (await client.get(f"{PROJECTS}/{project['id']}")).status_code == 403


@pytest.mark.integration
@pytest.mark.asyncio
async def test_update_edits_and_deletes_but_cannot_create(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """`projects.update` is the whole write surface minus creation."""
    await sign_in_with(client, session, [PermissionCode.PROJECTS_UPDATE])
    missing = uuid.uuid4()

    assert (await client.post(PROJECTS, json=CREATE_BODY)).status_code == 403
    assert (await client.patch(f"{PROJECTS}/{missing}", json={"name": "X"})).status_code == 404
    assert (await client.delete(f"{PROJECTS}/{missing}")).status_code == 404
    assert (await client.get(PROJECTS)).status_code == 403


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_three_codes_together_are_the_whole_surface(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """Everything the module offers, reachable with the three codes and nothing
    else — the positive control for the two negative tests above."""
    await sign_in_with(
        client,
        session,
        [
            PermissionCode.PROJECTS_READ,
            PermissionCode.PROJECTS_CREATE,
            PermissionCode.PROJECTS_UPDATE,
        ],
    )
    project = await a_project(client)

    assert (await client.get(PROJECTS)).status_code == 200
    assert (await client.get(f"{PROJECTS}/{project['id']}")).status_code == 200
    assert (
        await client.patch(f"{PROJECTS}/{project['id']}", json={"name": "Renamed"})
    ).status_code == 200
    assert (await client.delete(f"{PROJECTS}/{project['id']}")).status_code == 204


# --- the CRUD contract --------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_read_update_delete_and_the_code_never_moves(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The ordinary round trip, plus the two things the project shapes decide:
    the default status is `tender`, and the code — the identity — survives an
    edit that changes everything else about the row."""
    await sign_in_with(
        client,
        session,
        [
            PermissionCode.PROJECTS_READ,
            PermissionCode.PROJECTS_CREATE,
            PermissionCode.PROJECTS_UPDATE,
        ],
    )
    project = await a_project(client)
    assert project["status"] == "tender"
    assert project["responsible_user_id"] is None

    fetched = await client.get(f"{PROJECTS}/{project['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == project

    updated = await client.patch(
        f"{PROJECTS}/{project['id']}",
        json={
            "name": "Riverside Tower — Phase 2",
            "status": "awarded",
            "forecast_completion": "2027-06-30",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["code"] == project["code"]
    assert body["name"] == "Riverside Tower — Phase 2"
    assert body["status"] == "awarded"
    assert body["forecast_completion"] == "2027-06-30"
    # The contractual date is the one that did not move (C09's premise: the
    # forecast is revised against a contractual date that stays put).
    assert body["contractual_completion"] == CREATE_BODY["contractual_completion"]

    deleted = await client.delete(f"{PROJECTS}/{project['id']}")
    assert deleted.status_code == 204
    assert (await client.get(f"{PROJECTS}/{project['id']}")).status_code == 404


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_live_code_is_a_conflict_and_a_retired_code_is_free(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """D007's index is *partial*, and this is what that buys: two live projects
    may not share a code, but the tender C57 retires is history, so its code is
    available to the awarded successor that legitimately carries it. A full
    unique index would make the award impossible; a service-side check would be
    a second implementation of a rule the database already holds."""
    await sign_in_with(
        client,
        session,
        [
            PermissionCode.PROJECTS_READ,
            PermissionCode.PROJECTS_CREATE,
            PermissionCode.PROJECTS_UPDATE,
        ],
    )
    project = await a_project(client)

    duplicate = await client.post(PROJECTS, json=CREATE_BODY)
    assert duplicate.status_code == 409
    assert "live project" in duplicate.json()["detail"]

    retired = await client.patch(f"{PROJECTS}/{project['id']}", json={"status": "retired"})
    assert retired.status_code == 200
    successor = await a_project(client, name="Riverside Tower (awarded)", status="awarded")
    assert successor["code"] == project["code"]
    assert successor["id"] != project["id"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_completion_before_the_start_is_a_field_addressable_422(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """On create both dates are in the payload, so this is the schema's refusal
    — and it names the completion, the value the caller can fix."""
    await sign_in_with(client, session, [PermissionCode.PROJECTS_CREATE])

    response = await client.post(PROJECTS, json={**CREATE_BODY, "start_date": "2027-04-01"})
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail[0]["loc"] == ["body", "contractual_completion"]
    assert "before the project's start date" in detail[0]["msg"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_moving_one_date_past_the_other_is_a_field_addressable_422(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The mixed case: a payload that carries one side against the row's stored
    other. The schema cannot see the row, so this is the service's refusal — and
    it names the field the caller actually submitted, not the stored one, so the
    sentence lands on the control that has the typo."""
    await sign_in_with(
        client,
        session,
        [
            PermissionCode.PROJECTS_READ,
            PermissionCode.PROJECTS_CREATE,
            PermissionCode.PROJECTS_UPDATE,
        ],
    )
    project = await a_project(client)
    base = f"{PROJECTS}/{project['id']}"

    # The stored start is 2026-01-05; a new contractual completion before it.
    for body, field in (
        ({"contractual_completion": "2025-12-01"}, "contractual_completion"),
        ({"forecast_completion": "2025-12-01"}, "forecast_completion"),
        ({"start_date": "2028-01-01"}, "start_date"),
    ):
        response = await client.patch(base, json=body)
        assert response.status_code == 422, response.text
        assert response.json()["detail"][0]["loc"] == ["body", field]

    # And the row was not half-written: the refusal happens before any mutation.
    unchanged = await client.get(base)
    assert unchanged.json()["start_date"] == CREATE_BODY["start_date"]
    assert unchanged.json()["contractual_completion"] == CREATE_BODY["contractual_completion"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_an_empty_edit_is_a_bad_request_and_an_unknown_id_is_a_404(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """`{}` and a body of nothing but nulls are the same non-edit, and both are
    a 400 rather than a 200 that quietly changed nothing. An id that names no
    row is a 404 on all three by-id routes — the row is not hidden behind a 403
    for a caller who holds the code."""
    await sign_in_with(
        client,
        session,
        [
            PermissionCode.PROJECTS_CREATE,
            PermissionCode.PROJECTS_UPDATE,
            PermissionCode.PROJECTS_READ,
        ],
    )
    project = await a_project(client)
    base = f"{PROJECTS}/{project['id']}"

    assert (await client.patch(base, json={})).status_code == 400
    assert (await client.patch(base, json={"name": None})).status_code == 400

    missing = uuid.uuid4()
    assert (await client.get(f"{PROJECTS}/{missing}")).status_code == 404
    assert (await client.patch(f"{PROJECTS}/{missing}", json={"name": "X"})).status_code == 404
    assert (await client.delete(f"{PROJECTS}/{missing}")).status_code == 404


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_list_pages_filters_and_searches_literally(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The list's four jobs, in one place.

    Paging is offset-based with a stable total order, so no row appears twice
    across pages; `total` counts what the filters match rather than the page;
    `status` is the filter that makes the lifecycle state a *queryable* field;
    and `search` matches literally — a code containing `%` is a code, not a
    wildcard, which is what keeps a typed search term from turning into a scan
    over everything.
    """
    await sign_in_with(
        client, session, [PermissionCode.PROJECTS_READ, PermissionCode.PROJECTS_CREATE]
    )
    for index in range(3):
        await a_project(client, code=f"P-{2000 + index}", name=f"Tender {index}")
    await a_project(client, code="P-30%", name="Percent Sign")
    awarded = await a_project(client, code="P-3000", name="Awarded Job", status="awarded")

    default = (await client.get(PROJECTS)).json()
    assert default["total"] == 5
    assert default["page"] == 1
    assert default["page_size"] == 25
    assert len(default["items"]) == 5

    first = (await client.get(PROJECTS, params={"page": 1, "page_size": 2})).json()
    second = (await client.get(PROJECTS, params={"page": 2, "page_size": 2})).json()
    assert first["total"] == second["total"] == 5
    assert len(first["items"]) == 2
    assert {row["id"] for row in first["items"]} & {row["id"] for row in second["items"]} == set()

    awarded_only = (await client.get(PROJECTS, params={"status": "awarded"})).json()
    assert awarded_only["total"] == 1
    assert awarded_only["items"][0]["id"] == awarded["id"]

    literal = (await client.get(PROJECTS, params={"search": "%"})).json()
    assert literal["total"] == 1
    assert literal["items"][0]["code"] == "P-30%"

    by_name = (await client.get(PROJECTS, params={"search": "tender 1"})).json()
    assert by_name["total"] == 1

    # The bounds the user directory fixes (C22), and a sort the allowlist does
    # not name, are both a 422 rather than a silently different answer.
    assert (await client.get(PROJECTS, params={"page_size": 101})).status_code == 422
    assert (await client.get(PROJECTS, params={"sort": "responsible_user_id"})).status_code == 422
    assert (await client.get(PROJECTS, params={"status": "archived"})).status_code == 422

    ordered = (await client.get(PROJECTS, params={"sort": "code", "order": "asc"})).json()
    assert [row["code"] for row in ordered["items"]] == sorted(
        row["code"] for row in ordered["items"]
    )


# --- the audit trail ----------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_every_mutation_is_audited_with_its_diff(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """One event per mutation, in the mutation's own transaction (F043), and the
    update's diff records **which way the status moved** — the reason D008 needs
    no transition machine in the trail either: `project.update` plus a before/
    after is the whole story, and a separate verb would put the same fact in two
    places.

    Dates are ISO strings in the JSONB column, which is the other thing this
    pins: a `date` object would fail at the column, not at the reviewer's eye.
    """
    await sign_in_with(
        client,
        session,
        [PermissionCode.PROJECTS_CREATE, PermissionCode.PROJECTS_UPDATE],
    )
    project = await a_project(client)
    await client.patch(f"{PROJECTS}/{project['id']}", json={"status": "awarded"})
    await client.delete(f"{PROJECTS}/{project['id']}")

    rows = await audit_rows(session, project["id"])
    assert [row.action for row in rows] == [
        "project.create",
        "project.update",
        "project.delete",
    ]
    assert all(row.entity_type == "project" for row in rows)
    assert all(row.user_id is not None for row in rows)

    created = cast(dict[str, Any], rows[0].details)
    assert created["code"] == project["code"]
    assert created["start_date"] == CREATE_BODY["start_date"]

    updated = cast(dict[str, Any], rows[1].details)
    before = cast(dict[str, Any], updated["before"])
    after = cast(dict[str, Any], updated["after"])
    assert before["status"] == "tender"
    assert after["status"] == "awarded"
    assert before["forecast_completion"] == CREATE_BODY["forecast_completion"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_refused_mutation_leaves_no_event(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The atomicity F043 is built around, from the outside: a 409 and a 422
    both roll their transaction back, so the trail has no row describing a
    change that did not happen."""
    await sign_in_with(
        client, session, [PermissionCode.PROJECTS_CREATE, PermissionCode.PROJECTS_UPDATE]
    )
    project = await a_project(client)
    base = f"{PROJECTS}/{project['id']}"

    assert (await client.post(PROJECTS, json=CREATE_BODY)).status_code == 409
    assert (await client.patch(base, json={"start_date": "2028-01-01"})).status_code == 422
    assert (await client.patch(base, json={})).status_code == 400

    rows = await audit_rows(session, project["id"])
    assert [row.action for row in rows] == ["project.create"]


# --- the lifecycle, as a field ------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_status_moves_between_all_three_states(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """`tender` → `awarded` → `retired` and back to `tender`, each an ordinary
    edit under `projects.update`. Pinned as a *permission* fact rather than a
    workflow one: what D008 guarantees is that the field is writable by the code
    that owns it, not that any particular transition is legal — the transitions
    that are legal are C57's, and C57 is D033's."""
    await sign_in_with(
        client,
        session,
        [
            PermissionCode.PROJECTS_CREATE,
            PermissionCode.PROJECTS_UPDATE,
            PermissionCode.PROJECTS_READ,
        ],
    )
    project = await a_project(client)
    base = f"{PROJECTS}/{project['id']}"

    for state in ("awarded", "retired", "tender"):
        response = await client.patch(base, json={"status": state})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == state
        assert (await client.get(base)).json()["status"] == state

    assert (await client.patch(base, json={"status": "archived"})).status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_created_project_can_be_dated_today(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The one date edge the CHECKs and the schema agree on: a project whose
    start and both completions are the same day is legal (the constraints are
    `>=`, not `>`), so the boundary is inclusive on both sides."""
    await sign_in_with(client, session, [PermissionCode.PROJECTS_CREATE])
    today = date(2026, 10, 10).isoformat()

    project = await a_project(
        client,
        start_date=today,
        contractual_completion=today,
        forecast_completion=today,
    )
    assert project["start_date"] == today
    assert project["contractual_completion"] == today
