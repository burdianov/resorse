"""The Stage A boundary, checked against the tree rather than asserted (F063).

`BIG-PROMPT` §0.5, §0.6 and §3.1, as executable statements: no Next.js, no Redis,
and no construction-domain vocabulary in anything this foundation ships. BP-0.5,
BP-0.6 and BP-3.1 all name F063 for the leakage check, and this is it.

Every pattern is anchored so that a **mention** is not a match. This repository
describes both prohibitions in prose on purpose — `README.md` and
`theme-provider.tsx` both explain why there is no Next.js, `docker-compose.yml`
says in a comment that there is no Redis — and a scan that flagged its own
documentation would be deleted within a week. A dependency name, an import
statement, a file name and a compose service are facts; a sentence is not.

No test here touches the database, so none carries the `integration` marker:
`tests/test_markers.py` fails that direction too.
"""

import json
import re
import tomllib
from pathlib import Path
from typing import Any

from demo_records import router as extension_router

from app.api.v1.router import api_router

REPOSITORY = Path(__file__).resolve().parents[2]
FRONTEND = REPOSITORY / "frontend"
BACKEND = REPOSITORY / "backend"

# A dependency *name* — the frontend's package sections, the backend's PEP 508
# strings — for the packages §0.5/§0.6 forbid. Anchored at the start so
# `next-themes` (a Next.js package, and one the SPA deliberately does without)
# matches while a package that merely contains the word does not.
FORBIDDEN_PACKAGE = re.compile(r"^(?:next(?:$|[-/])|@next/|redis$|ioredis$|@redis/)")

# An import statement. The quote is part of the pattern, which is what keeps a
# comment that names `next/font` in backticks out of the result.
FORBIDDEN_TS_IMPORT = re.compile(
    r"""(?:from|import|require\()\s*['"](?:next[/'"]|redis['"]|ioredis['"])"""
)
FORBIDDEN_PY_IMPORT = re.compile(r"^\s*(?:from|import)\s+(?:next|redis|ioredis)\b", re.MULTILINE)

# §3.1's exclusions, as nouns that would not appear here by accident: each is a
# Stage B concept (D001–D091). Two words the source uses in a legitimate,
# non-domain sense are deliberately absent — `discipline` ("the F043 discipline",
# four times) and `assignment` (of a value) — because a scan that has to be
# explained away at every match stops being read. `revision` is absent for the
# same reason: this repository means Alembic's.
DOMAIN_TERMS = (
    "commissioning",
    "qaqc",
    "checklist",
    "contractor",
    "tender",
    "designation",
    "manpower",
    "timesheet",
    "attendance",
    "payroll",
    "roster",
    "employee",
    "department",
    r"cost\s+cent(?:re|er)",
    r"master\s+data",
    r"work\s+item",
    r"site\s+engineer",
    r"bill\s+of\s+quantities",
)
DOMAIN_VOCABULARY = re.compile(r"\b(?:" + "|".join(DOMAIN_TERMS) + r")\b", re.IGNORECASE)

# The trees that ship: the SPA, the API, the schema history and the backend's own
# tooling. Tests are not scanned — a test may name whatever it tests — and neither
# are the documents, which is what the paragraph in this module's docstring is
# about.
SHIPPED_PYTHON = (
    BACKEND / "app",
    BACKEND / "migrations",
    BACKEND / "scripts",
)
# `public/` is shipped source too — it is served as-is, without a bundler — so the
# one hand-written script there (`theme-init.js`, F060) is scanned like the rest.
SHIPPED_FRONTEND = (FRONTEND / "src", FRONTEND / "public")
# Files outside those trees that also ship and take a configuration value. The
# vocabulary test asserts every one of them exists, so a rename shows up as a
# failure rather than as a scan that quietly stopped covering something.
SHIPPED_FILES = (
    REPOSITORY / ".env.example",
    REPOSITORY / ".env.production.example",
    REPOSITORY / "docker-compose.yml",
    REPOSITORY / "docker-compose.prod.yml",
    REPOSITORY / "deploy" / "Caddyfile",
    FRONTEND / "index.html",
    FRONTEND / "package.json",
    BACKEND / "pyproject.toml",
)


def python_sources() -> list[Path]:
    return sorted(path for root in SHIPPED_PYTHON for path in root.rglob("*.py"))


def frontend_sources() -> list[Path]:
    return sorted(
        path
        for root in SHIPPED_FRONTEND
        for path in root.rglob("*")
        if path.is_file() and path.suffix in {".ts", ".tsx", ".css", ".js"}
    )


def readable(paths: list[Path]) -> list[tuple[Path, str]]:
    return [(path, path.read_text(encoding="utf-8", errors="replace")) for path in paths]


def dependency_name(specification: str) -> str:
    """`fastapi==0.143.0` → `fastapi`; extras and markers are dropped."""
    return re.split(r"[\s\[<>=!~;]", specification.strip(), maxsplit=1)[0].lower()


def matches(pattern: re.Pattern[str], sources: list[tuple[Path, str]]) -> list[str]:
    found: list[str] = []
    for path, text in sources:
        for number, line in enumerate(text.splitlines(), start=1):
            if pattern.search(line):
                found.append(f"{path.relative_to(REPOSITORY)}:{number}: {line.strip()}")
    return found


def test_no_forbidden_dependency_is_declared() -> None:
    package: dict[str, Any] = json.loads((FRONTEND / "package.json").read_text(encoding="utf-8"))
    declared = {
        name
        for section in (
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "optionalDependencies",
        )
        for name in (package.get(section) or {})
    }

    with (BACKEND / "pyproject.toml").open("rb") as handle:
        project: dict[str, Any] = tomllib.load(handle)
    declared |= {dependency_name(spec) for spec in project["project"]["dependencies"]}
    declared |= {dependency_name(spec) for spec in project["dependency-groups"]["dev"]}

    offenders = sorted(name for name in declared if FORBIDDEN_PACKAGE.match(name))
    assert not offenders, offenders


def test_no_forbidden_import_reaches_the_shipped_source() -> None:
    offenders = matches(FORBIDDEN_TS_IMPORT, readable(frontend_sources()))
    offenders += matches(FORBIDDEN_PY_IMPORT, readable(python_sources()))

    assert not offenders, "\n".join(offenders)


def test_no_forbidden_artefact_exists() -> None:
    assert not list(FRONTEND.glob("next.config.*"))
    assert not (FRONTEND / ".next").exists()

    # A compose service named `redis`, or an image that is one. The comment in
    # `docker-compose.yml` that says there is none does not match either pattern.
    for compose in sorted(
        list(REPOSITORY.glob("docker-compose*.yml"))
        + list(REPOSITORY.glob(".github/workflows/*.yml"))
    ):
        text = compose.read_text(encoding="utf-8")
        assert not re.search(r"^\s+redis:", text, re.MULTILINE), compose
        assert not re.search(r"image:\s*\S*redis", text, re.IGNORECASE), compose


def test_no_construction_domain_vocabulary_in_the_shipped_trees() -> None:
    # A scan is only as wide as the files it names, so the files are named and
    # then required to exist: a rename fails here instead of shrinking the check.
    missing = [path for path in SHIPPED_FILES if not path.exists()]
    assert not missing, missing

    offenders = matches(DOMAIN_VOCABULARY, readable(python_sources()))
    offenders += matches(DOMAIN_VOCABULARY, readable(frontend_sources()))
    offenders += matches(DOMAIN_VOCABULARY, readable(list(SHIPPED_FILES)))

    assert not offenders, "\n".join(offenders)


def test_the_test_only_extension_module_is_not_wired_into_the_application() -> None:
    """The backend half of "removed from production navigation" (BP-12-P7).

    `backend/tests/demo_records.py` is a module like any other: it registers a
    router, a model and a table name. What makes it a *proof* is that the
    application never hears about it — the composition root does not mount its
    router, the model registry does not import its model, and no path it declares
    answers on the API. (Importing the module here for this assertion does put its
    table in `Base.metadata` for this process, which is why the check is about the
    wiring rather than about the metadata — and why the model's migration half is
    asserted in `test_extension_contract.py`.)
    """
    mounted = {getattr(route, "path", "") for route in api_router.routes}
    assert not any("/records" in path for path in mounted), mounted

    for source in (
        BACKEND / "app" / "api" / "v1" / "router.py",
        BACKEND / "app" / "models" / "__init__.py",
    ):
        assert "demo" not in source.read_text(encoding="utf-8").lower(), source

    # The router object itself is the test's, not the application's.
    assert extension_router.routes, "the extension module registers no route"
    assert all(
        getattr(route, "path", "").startswith("/records") for route in extension_router.routes
    )
