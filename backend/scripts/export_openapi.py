"""Write the application's OpenAPI schema to ``openapi.json``.

This is the *first* step of the typed-client pipeline (F018): FastAPI is the
source of truth for the API contract, and the frontend's TypeScript DTOs are
generated from this file rather than hand-written. See ``docs/OPENAPI_CLIENT.md``.

The schema is produced by importing the app — no server, no database, no
network — so the same command works in CI (the F061 drift check regenerates the
file and the DTOs, then fails on any diff).

Usage (from ``backend/``):

    uv run python -m scripts.export_openapi [output-path]

The default output is ``backend/openapi.json`` and the file is committed: it is
the reference CI compares against.
"""

import json
import sys
from pathlib import Path

from app.main import app

DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "openapi.json"


def main() -> None:
    output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT
    schema = app.openapi()
    # Sorted keys and a fixed indent make regeneration byte-stable, which is
    # what lets the drift check be a plain `git diff --exit-code`.
    output.write_text(
        json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
        # Explicit LF: the default text mode would write CRLF on Windows, and
        # this repository keeps LF in the working tree as well as the index
        # (.gitattributes + the `git ls-files --eol` check in NEXT_PROMPT §8).
        newline="\n",
    )
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
