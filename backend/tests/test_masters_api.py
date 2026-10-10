"""Master data API (D005): the guards, the CRUD, and the reference rule.

The task's acceptance is **scoped CRUD tests**, and "scoped" is two claims that
this file proves separately:

- **Scoped by permission.** Every one of the fifteen routes sits behind its own
  code — reading a resource needs that resource's `.read`, every mutation needs
  its `.manage` — so holding `disciplines.read` opens the discipline list and
  nothing else. The six codes are the first Stage B ones (DOMAIN_ARCHITECTURE
  §3), and the per-resource split is what the map draws; a shared "masters"
  code would pass a CRUD test and fail the product.
- **Scoped by data.** A delete is refused while another row still points at the
  row — a designation naming a discipline or a department — because the map's
  policy for a referenced reference row is deactivation, not removal
  (`ON DELETE RESTRICT`, D004). The refusal is the database's, translated to a
  409; the tests below prove it from both sides, including that the same
  delete succeeds once the designation is gone.

Everything else here is the ordinary contract: the code is the identity and
cannot be edited, an unknown reference is a field-addressable 422 rather than a
500, an empty edit is a 400, and every mutation lands in the audit trail with
its diff. The two pure tests at the top need no database and carry no marker —
`tests/test_markers.py` fails in both directions.
"""

import uuid
from typing import Any, cast, get_args

import httpx
import pytest
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import PERMISSION_DENIED_DETAIL
from app.core.cookies import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.core.permissions import PermissionCode
from app.core.security import hash_password
from app.models import AuditLog, Permission, Role, User
from app.models.masters import DEPARTMENT_CLASSIFICATIONS
from app.schemas.masters import (
    DepartmentClassification,
    UpdateDepartmentRequest,
    UpdateDesignationRequest,
    UpdateDisciplineRequest,
)

MASTERS = "/api/v1/masters"
PASSWORD = "correct horse battery staple"

READ_CODES = [
    PermissionCode.DISCIPLINES_READ,
    PermissionCode.DEPARTMENTS_READ,
    PermissionCode.DESIGNATIONS_READ,
]
MANAGE_CODES = [
    PermissionCode.DISCIPLINES_MANAGE,
    PermissionCode.DEPARTMENTS_MANAGE,
    PermissionCode.DESIGNATIONS_MANAGE,
]

# A body each create route accepts, for the tests that only care that the
# *guard* answered first (401/403) — the values never reach the service.
CREATE_BODIES: dict[str, dict[str, Any]] = {
    "disciplines": {"code": "civil", "name": "Civil"},
    "departments": {"code": "site_a", "name": "Site A", "classification": "SITE"},
    "designations": {
        "code": "supervisor",
        "name": "Supervisor",
        "department_id": "00000000-0000-0000-0000-000000000001",
        "discipline_id": "00000000-0000-0000-0000-000000000002",
    },
}

RESOURCES = sorted(CREATE_BODIES)


# --- pure: the two decisions the shapes make ----------------------------------


def test_the_classification_literal_mirrors_the_model() -> None:
    """`DEPARTMENT_CLASSIFICATIONS` is the model's tuple and
    `DepartmentClassification` is the schema's literal; the model's own note
    says D005's schema mirrors it, and this is what keeps the mirror honest.
    A third classification therefore has to be added in both places or fail
    here — which is the point, since the CHECK constraint is generated from
    the tuple and the OpenAPI enum from the literal."""
    assert set(get_args(DepartmentClassification)) == set(DEPARTMENT_CLASSIFICATIONS)


@pytest.mark.parametrize(
    "shape", [UpdateDisciplineRequest, UpdateDepartmentRequest, UpdateDesignationRequest]
)
def test_the_edit_shapes_do_not_offer_the_code(shape: type[BaseModel]) -> None:
    """The code is the identity (D002's rule) and the edit shapes do not carry
    it, with `extra="forbid"` so a payload that tries anyway is a 422 at the
    unknown field. Silently ignoring a submitted code would be worse than
    either: the caller would see a 200 and believe the rename happened."""
    assert "code" not in shape.model_fields
    assert shape.model_config["extra"] == "forbid"


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


# The three creators go through the API on purpose: every test below then also
# proves the create route on the way to whatever it is really about.


async def a_discipline(client: httpx.AsyncClient, *, code: str = "civil") -> dict[str, Any]:
    response = await client.post(
        f"{MASTERS}/disciplines", json={"code": code, "name": code.title()}
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


async def a_department(
    client: httpx.AsyncClient, *, code: str = "site_a", classification: str = "SITE"
) -> dict[str, Any]:
    response = await client.post(
        f"{MASTERS}/departments",
        json={"code": code, "name": code.title(), "classification": classification},
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


async def a_designation(
    client: httpx.AsyncClient, *, department_id: str, discipline_id: str, code: str = "supervisor"
) -> dict[str, Any]:
    response = await client.post(
        f"{MASTERS}/designations",
        json={
            "code": code,
            "name": "Supervisor",
            "department_id": department_id,
            "discipline_id": discipline_id,
        },
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


# --- the guards: a session, one code per resource, one action per code --------


@pytest.mark.parametrize("resource", RESOURCES)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_every_master_route_requires_a_session(
    client: httpx.AsyncClient, resource: str
) -> None:
    missing = uuid.uuid4()
    base = f"{MASTERS}/{resource}"

    assert (await client.get(base)).status_code == 401
    assert (await client.post(base, json=CREATE_BODIES[resource])).status_code == 401
    assert (await client.get(f"{base}/{missing}")).status_code == 401
    assert (await client.patch(f"{base}/{missing}", json={"name": "X"})).status_code == 401
    assert (await client.delete(f"{base}/{missing}")).status_code == 401


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_read_code_opens_its_own_resource_and_no_other(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """`disciplines.read` reads disciplines. The other two lists stay closed —
    which is the whole reason the map gives each table its own pair instead of
    one `masters.read`."""
    await sign_in_with(client, session, [PermissionCode.DISCIPLINES_READ])

    assert (await client.get(f"{MASTERS}/disciplines")).status_code == 200
    assert (await client.get(f"{MASTERS}/departments")).status_code == 403
    assert (await client.get(f"{MASTERS}/designations")).status_code == 403


@pytest.mark.parametrize("resource", RESOURCES)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_every_read_code_together_still_writes_nothing(
    client: httpx.AsyncClient, session: AsyncSession, resource: str
) -> None:
    """Read-only means read-only (C16): the three `.read` codes open the three
    lists and no mutation."""
    await sign_in_with(client, session, READ_CODES)
    missing = uuid.uuid4()
    base = f"{MASTERS}/{resource}"

    created = await client.post(base, json=CREATE_BODIES[resource])
    assert created.status_code == 403
    assert created.json()["detail"] == PERMISSION_DENIED_DETAIL
    assert (await client.patch(f"{base}/{missing}", json={"name": "X"})).status_code == 403
    assert (await client.delete(f"{base}/{missing}")).status_code == 403


@pytest.mark.integration
@pytest.mark.asyncio
async def test_manage_does_not_imply_read(client: httpx.AsyncClient, session: AsyncSession) -> None:
    """The guard checks the one code the route names — the same semantics
    `roles.manage` has had since F035. Pinned here so nobody "fixes" it into an
    implied pair: the seeded roles hold both codes anyway, and a custom role
    that should list *and* edit is granted both, visibly, in the matrix."""
    await sign_in_with(client, session, [PermissionCode.DISCIPLINES_MANAGE])

    created = await client.post(f"{MASTERS}/disciplines", json=CREATE_BODIES["disciplines"])
    assert created.status_code == 201, created.text
    assert (await client.get(f"{MASTERS}/disciplines")).status_code == 403


# --- disciplines: the CRUD contract -------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_discipline_is_created_read_back_and_listed(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))

    created = await a_discipline(client, code="civil")
    assert created["code"] == "civil"
    assert created["name"] == "Civil"
    assert created["is_active"] is True

    fetched = await client.get(f"{MASTERS}/disciplines/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == created

    listed = await client.get(f"{MASTERS}/disciplines")
    assert listed.status_code == 200
    assert listed.json()["items"] == [created]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_duplicate_code_is_a_conflict_not_a_second_row(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    await a_discipline(client, code="civil")

    again = await client.post(f"{MASTERS}/disciplines", json={"code": "civil", "name": "Civil 2"})

    assert again.status_code == 409
    assert again.json()["detail"] == "A discipline with this code already exists."


@pytest.mark.parametrize("code", ["Civil", "civil works", "1st_civil", ""])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_malformed_code_is_refused_at_the_field(
    client: httpx.AsyncClient, session: AsyncSession, code: str
) -> None:
    """The schema's shape check, addressed to the field the form renders —
    the model's CHECK is the same rule at the floor, and this is the message."""
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))

    response = await client.post(f"{MASTERS}/disciplines", json={"code": code, "name": "Named"})

    assert response.status_code == 422
    entry = response.json()["detail"][0]
    assert entry["loc"] == ["body", "code"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_blank_name_is_refused_at_the_field(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))

    response = await client.post(f"{MASTERS}/disciplines", json={"code": "civil", "name": "   "})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "name"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_an_unknown_row_is_a_404_naming_the_resource(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    missing = uuid.uuid4()

    assert (await client.get(f"{MASTERS}/disciplines/{missing}")).status_code == 404
    fetched = await client.get(f"{MASTERS}/designations/{missing}")
    assert fetched.status_code == 404
    assert fetched.json()["detail"] == "Designation not found."
    assert (
        await client.patch(f"{MASTERS}/departments/{missing}", json={"name": "X"})
    ).status_code == 404
    assert (await client.delete(f"{MASTERS}/departments/{missing}")).status_code == 404


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_name_edits_and_the_flag_flips(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    created = await a_discipline(client, code="civil")

    renamed = await client.patch(
        f"{MASTERS}/disciplines/{created['id']}", json={"name": "  Civil Works  "}
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Civil Works"  # trimmed
    assert renamed.json()["is_active"] is True  # untouched

    deactivated = await client.patch(
        f"{MASTERS}/disciplines/{created['id']}", json={"is_active": False}
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    assert deactivated.json()["name"] == "Civil Works"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_list_is_sorted_by_code_and_keeps_deactivated_rows(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """A deactivated row is *present and not offered*, which is only true if
    the list still returns it — an operator who retired something by mistake
    has to be able to see it and flip it back."""
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    await a_discipline(client, code="electrical")
    retired = await a_discipline(client, code="civil")
    await client.patch(f"{MASTERS}/disciplines/{retired['id']}", json={"is_active": False})

    listed = await client.get(f"{MASTERS}/disciplines")

    assert [item["code"] for item in listed.json()["items"]] == ["civil", "electrical"]
    assert listed.json()["items"][0]["is_active"] is False


@pytest.mark.parametrize(
    ("payload", "note"),
    [
        ({}, "nothing at all"),
        ({"name": None, "is_active": None}, "only nulls, which is not a value"),
    ],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_an_empty_edit_is_a_bad_request(
    client: httpx.AsyncClient, session: AsyncSession, payload: dict[str, Any], note: str
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    created = await a_discipline(client, code="civil")

    response = await client.patch(f"{MASTERS}/disciplines/{created['id']}", json=payload)

    assert response.status_code == 400, note
    assert response.json()["detail"] == "No changes were submitted."


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_submitted_code_is_refused_rather_than_ignored(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The code is not in the edit shape and the shape forbids extras: a
    caller that tries to rename one is told so at the field, and the row's
    code is unchanged."""
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    created = await a_discipline(client, code="civil")

    response = await client.patch(
        f"{MASTERS}/disciplines/{created['id']}", json={"code": "civil_works"}
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "code"]
    fetched = await client.get(f"{MASTERS}/disciplines/{created['id']}")
    assert fetched.json()["code"] == "civil"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_an_unused_row_can_be_deleted(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    created = await a_discipline(client, code="civil")

    assert (await client.delete(f"{MASTERS}/disciplines/{created['id']}")).status_code == 204

    assert (await client.get(f"{MASTERS}/disciplines/{created['id']}")).status_code == 404
    assert (await client.get(f"{MASTERS}/disciplines")).json()["items"] == []


# --- departments: the one extra column ----------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_department_carries_its_classification(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))

    created = await a_department(client, code="head_office", classification="HEAD_OFFICE")

    assert created["classification"] == "HEAD_OFFICE"
    reclassified = await client.patch(
        f"{MASTERS}/departments/{created['id']}", json={"classification": "SITE"}
    )
    assert reclassified.status_code == 200
    assert reclassified.json()["classification"] == "SITE"


@pytest.mark.parametrize("classification", ["site", "SITE_OFFICE", "", "Head Office"])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_classification_outside_the_two_is_refused_at_the_field(
    client: httpx.AsyncClient, session: AsyncSession, classification: str
) -> None:
    """The closed vocabulary is not normalised: `site` is not `SITE`, because
    the two tokens are the specification's own and the column's CHECK takes
    only those. The message the client shows is Pydantic's enumeration."""
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))

    response = await client.post(
        f"{MASTERS}/departments",
        json={"code": "site_a", "name": "Site A", "classification": classification},
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "classification"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_department_needs_a_code_that_is_free(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    await a_department(client, code="site_a")

    again = await client.post(
        f"{MASTERS}/departments",
        json={"code": "site_a", "name": "The other site", "classification": "SITE"},
    )

    assert again.status_code == 409
    assert again.json()["detail"] == "A department with this code already exists."


# --- designations: the two references -----------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_designation_resolves_both_references(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    department = await a_department(client, code="site_a")
    discipline = await a_discipline(client, code="civil")

    created = await a_designation(
        client, department_id=department["id"], discipline_id=discipline["id"]
    )

    assert created["department_id"] == department["id"]
    assert created["discipline_id"] == discipline["id"]
    assert created["is_active"] is True


@pytest.mark.parametrize("field", ["department_id", "discipline_id"])
@pytest.mark.integration
@pytest.mark.asyncio
async def test_an_unknown_reference_is_a_field_error_not_a_500(
    client: httpx.AsyncClient, session: AsyncSession, field: str
) -> None:
    """Both references are required, and a foreign key refusal at commit time
    would reach the caller as a 500. The service resolves each id first, so an
    id that names no row is the field-addressed 422 the form layer expects
    (F037's shape). The foreign keys stay the floor under it."""
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    department = await a_department(client, code="site_a")
    discipline = await a_discipline(client, code="civil")
    references = {"department_id": department["id"], "discipline_id": discipline["id"]}
    references[field] = str(uuid.uuid4())

    response = await client.post(
        f"{MASTERS}/designations",
        json={"code": "supervisor", "name": "Supervisor", **references},
    )

    assert response.status_code == 422
    entry = response.json()["detail"][0]
    assert entry["loc"] == ["body", field]
    assert entry["msg"] == f"No such {field.removesuffix('_id')}."


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_designation_can_move_to_another_department(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    first = await a_department(client, code="site_a")
    second = await a_department(client, code="site_b")
    discipline = await a_discipline(client, code="civil")
    created = await a_designation(client, department_id=first["id"], discipline_id=discipline["id"])

    moved = await client.patch(
        f"{MASTERS}/designations/{created['id']}", json={"department_id": second["id"]}
    )

    assert moved.status_code == 200, moved.text
    assert moved.json()["department_id"] == second["id"]
    assert moved.json()["discipline_id"] == discipline["id"]  # untouched


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_move_to_a_row_that_does_not_exist_is_refused_at_the_field(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    department = await a_department(client, code="site_a")
    discipline = await a_discipline(client, code="civil")
    created = await a_designation(
        client, department_id=department["id"], discipline_id=discipline["id"]
    )

    response = await client.patch(
        f"{MASTERS}/designations/{created['id']}", json={"discipline_id": str(uuid.uuid4())}
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "discipline_id"]


# --- the reference rule: deactivate, never delete what is referenced ----------


@pytest.mark.parametrize(
    ("parent", "reference"),
    [("disciplines", "discipline_id"), ("departments", "department_id")],
)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_referenced_row_cannot_be_deleted_and_says_what_to_do(
    client: httpx.AsyncClient, session: AsyncSession, parent: str, reference: str
) -> None:
    """The acceptance's second half. The refusal is the database's
    (`ON DELETE RESTRICT`), so it holds however the delete is attempted; what
    this test adds is that the service turns it into a 409 with the product's
    answer — deactivate — and that nothing was removed on the way to finding
    out."""
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    department = await a_department(client, code="site_a")
    discipline = await a_discipline(client, code="civil")
    references = {"department_id": department["id"], "discipline_id": discipline["id"]}
    await a_designation(client, department_id=department["id"], discipline_id=discipline["id"])

    response = await client.delete(f"{MASTERS}/{parent}/{references[reference]}")

    assert response.status_code == 409
    assert "Deactivate it instead." in response.json()["detail"]
    # Still there, and still readable — the rollback did not half-remove it.
    assert (await client.get(f"{MASTERS}/{parent}/{references[reference]}")).status_code == 200


@pytest.mark.integration
@pytest.mark.asyncio
async def test_the_same_delete_succeeds_once_nothing_references_the_row(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """The refusal above is caused by the reference and nothing else: remove
    the designation and the department becomes deletable. Without this, a
    blanket "never delete a referenced table" would look identical."""
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    department = await a_department(client, code="site_a")
    discipline = await a_discipline(client, code="civil")
    designation = await a_designation(
        client, department_id=department["id"], discipline_id=discipline["id"]
    )

    assert (await client.delete(f"{MASTERS}/departments/{department['id']}")).status_code == 409
    assert (await client.delete(f"{MASTERS}/designations/{designation['id']}")).status_code == 204
    assert (await client.delete(f"{MASTERS}/departments/{department['id']}")).status_code == 204


# --- the audit trail ----------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_every_mutation_is_audited_with_its_diff(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """F043's rule: the event commits with the change, and the diff is the
    minimal before/after. A deactivation is an update — `is_active` appears
    inside that diff rather than as an event of its own (C64)."""
    caller = await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    created = await a_discipline(client, code="civil")
    await client.patch(f"{MASTERS}/disciplines/{created['id']}", json={"is_active": False})
    await client.delete(f"{MASTERS}/disciplines/{created['id']}")

    events = {
        event.action: event
        for event in await session.scalars(
            select(AuditLog).where(AuditLog.entity_type == "discipline")
        )
    }

    assert set(events) == {"discipline.create", "discipline.update", "discipline.delete"}
    assert all(event.actor_email == caller.email for event in events.values())
    assert all(str(event.entity_id) == created["id"] for event in events.values())

    create = events["discipline.create"]
    assert create.summary == "Created discipline civil."
    assert create.details == {"code": "civil", "name": "Civil"}

    update = events["discipline.update"]
    assert update.summary == "Updated discipline civil."
    details = cast(dict[str, Any], update.details)
    assert details["before"] == {"name": "Civil", "is_active": True}
    assert details["after"] == {"name": "Civil", "is_active": False}

    assert events["discipline.delete"].details == {"code": "civil"}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a_refused_mutation_leaves_no_audit_row(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """One transaction, or no story: the event is added to the same session as
    the change, so a delete the database refused takes its event down with it.
    A trail that recorded attempts would answer a different question than
    "what happened"."""
    await sign_in_with(client, session, list(READ_CODES + MANAGE_CODES))
    department = await a_department(client, code="site_a")
    discipline = await a_discipline(client, code="civil")
    await a_designation(client, department_id=department["id"], discipline_id=discipline["id"])

    assert (await client.delete(f"{MASTERS}/disciplines/{discipline['id']}")).status_code == 409

    actions = set(
        await session.scalars(select(AuditLog.action).where(AuditLog.entity_type == "discipline"))
    )
    assert actions == {"discipline.create"}
