"""TTL cache on disk.

On disk rather than in the frontend so it survives a Steam restart, and because
RA asks API consumers not to hammer the endpoints. The cache key never contains
the API key -- see `RaClient._cache_key`.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ra.jsonutil import as_dict


class DiskCache:
    def __init__(self, directory: Path, now: Callable[[], float] = time.time) -> None:
        self._dir = directory
        self._now = now  # injected so tests can travel through time

    def _file(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
        return self._dir / f"{digest}.json"

    def _read(self, key: str) -> tuple[Any, float] | None:
        """Returns (value, age in seconds) regardless of TTL, or None."""
        path = self._file(key)
        try:
            decoded: object = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

        entry = as_dict(decoded)
        if entry is None:
            return None

        stored_at: object = entry.get("ts")
        if not isinstance(stored_at, (int, float)):
            return None

        # A clock that moved backwards would otherwise report a negative age.
        age = max(0.0, self._now() - float(stored_at))
        return entry.get("value"), age

    def get(self, key: str, ttl: float) -> Any | None:
        found = self._read(key)
        if found is None:
            return None
        value, age = found
        return None if age > ttl else value

    def get_stale(self, key: str) -> tuple[Any, float] | None:
        """Ignores the TTL entirely.

        Used only when the network has already failed: old data plus an
        "offline" note beats an error screen on a handheld away from wifi.
        """
        return self._read(key)

    def put(self, key: str, value: Any) -> None:
        path = self._file(key)
        payload = json.dumps({"ts": self._now(), "value": value})
        try:
            # mkdir belongs inside the guard: it fails if the cache path exists as
            # a file or the filesystem is read-only, and that must not take down
            # the request whose response we were merely trying to cache.
            self._dir.mkdir(parents=True, exist_ok=True)

            # Write-then-rename so a crash mid-write cannot leave a truncated entry
            # that later reads would treat as valid JSON.
            tmp = path.with_suffix(".tmp")
            tmp.write_text(payload, encoding="utf-8")
            tmp.replace(path)
        except OSError:
            # A cache that cannot be written is a performance problem, not a
            # correctness one. Callers still get live data.
            return

    def clear(self) -> None:
        if not self._dir.is_dir():
            return
        for entry in self._dir.glob("*.json"):
            entry.unlink(missing_ok=True)
