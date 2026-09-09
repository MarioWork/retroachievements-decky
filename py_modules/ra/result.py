"""The exact dict shape every RPC route returns.

Mirrored by `Result<T>` in `src/types/result.ts`. Keeping the envelope explicit
means an error crosses the RPC boundary as data the UI can branch on, instead of
as a rejected promise with no usable message.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from ra.errors import ErrorPayload, RaError


class OkResult(TypedDict):
    ok: Literal[True]
    data: Any
    # Age in seconds when this came from the cache after the network failed;
    # None on a live response. The UI turns it into an "offline" note.
    stale_seconds: float | None
    # Set when a paged collection could only be partly fetched: the count RA
    # said exists, so the UI can name what is missing.
    partial_total: int | None


class ErrResult(TypedDict):
    ok: Literal[False]
    error: ErrorPayload


Result = OkResult | ErrResult


def ok(
    data: Any,
    stale_seconds: float | None = None,
    partial_total: int | None = None,
) -> OkResult:
    return {
        "ok": True,
        "data": data,
        "stale_seconds": stale_seconds,
        "partial_total": partial_total,
    }


def err(error: RaError) -> ErrResult:
    return {"ok": False, "error": error.to_dict()}
