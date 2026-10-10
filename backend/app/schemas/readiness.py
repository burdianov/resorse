"""Readiness shape (F065, BP-8.4b).

One answer per dependency rather than one verdict, because they fail
separately: PostgreSQL is required, and the two halves of a report are not — a
converter that is down stops DOCX, not the application (C40, C41). Each check
carries ``required`` so a reader does not have to know which dependency decides
the headline, and every answer is a boolean: a probe's body is read by a
monitor, and the deployment's own error text is the last thing that should
travel with it (the rule ``engine-health`` follows).

The three statuses are the *serving* question, not the *alive* one: ``ready``
and ``degraded`` both mean this process should receive traffic, and only
``not_ready`` means it should not. The route carries the same distinction as an
HTTP status, so a caller that reads nothing but the status line still reads it
right.
"""

from typing import Literal

from pydantic import BaseModel


class DependencyCheck(BaseModel):
    """One dependency's answer, and whether the application needs it up."""

    name: str
    status: Literal["up", "down"]
    required: bool


class ReadinessResponse(BaseModel):
    """The verdict, and the answers it is made of."""

    status: Literal["ready", "degraded", "not_ready"]
    checks: list[DependencyCheck]
