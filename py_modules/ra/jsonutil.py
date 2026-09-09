"""Narrowing helpers for decoded JSON.

`json.loads` hands back `Any`. Passing that around defeats the point of running
pyright in strict mode, so responses are narrowed here once and explicitly.
"""

from __future__ import annotations

from typing import Any, cast


def as_dict(value: object) -> dict[str, Any] | None:
    """Returns the value as a str-keyed dict, or None if it is not an object.

    JSON object keys are always strings, so the cast is safe by construction.
    """
    if isinstance(value, dict):
        return cast("dict[str, Any]", value)
    return None


def as_list(value: object) -> list[Any] | None:
    """Returns the value as a list, or None if it is not one.

    JSON arrays are heterogeneous, so the element type is Any by nature; callers
    narrow each element themselves.
    """
    if isinstance(value, list):
        return cast("list[Any]", value)
    return None
