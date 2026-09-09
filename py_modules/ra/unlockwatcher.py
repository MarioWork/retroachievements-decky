"""Background poller that turns new RetroAchievements unlocks into toasts.

This has to live in the backend. A Decky plugin's frontend only mounts while the
Quick Access panel is open, so a `setInterval` there would stop polling exactly
when the user is playing -- which is the only time the feature matters.

The decision logic is deliberately a pure function (`select_new_unlocks`) with
the fetch, emit and sleep all injected, so the awkward cases -- first run after
enabling, restart persistence, RA repeating an entry -- are unit-testable with no
Decky runtime and no network.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import Awaitable, Callable, Collection, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Final

from ra.jsonutil import as_dict, as_list

# Poll less often than the window we ask RA for, so a slow request or a missed
# tick cannot open a gap that loses an unlock. Overlap is free -- dedupe absorbs it.
DEFAULT_POLL_SECONDS: Final = 120.0
POLL_WINDOW_MINUTES: Final = 15

# Enough history to cover any plausible overlap without growing without bound.
MAX_SEEN_KEYS: Final = 500

EVENT_NAME: Final = "ra_unlock"


def unlock_key(entry: dict[str, Any]) -> str:
    """Identity of a single unlock event.

    Hardcore is part of the key on purpose: earning an achievement in softcore
    and later in hardcore are two genuine events, and RA reports them separately.
    """
    achievement_id = entry.get("AchievementID", entry.get("achievementId", ""))
    hardcore = entry.get("HardcoreMode", entry.get("hardcoreMode", 0))
    return f"{achievement_id}:{1 if str(hardcore) in ('1', 'True', 'true') else 0}"


def to_payload(entry: dict[str, Any]) -> dict[str, Any]:
    """Only the fields the toast needs. Keeps the event small and stable."""
    return {
        "id": entry.get("AchievementID", entry.get("achievementId")),
        "title": entry.get("Title", entry.get("title", "")),
        "description": entry.get("Description", entry.get("description", "")),
        "points": entry.get("Points", entry.get("points", 0)),
        "badgeName": entry.get("BadgeName", entry.get("badgeName", "")),
        "gameTitle": entry.get("GameTitle", entry.get("gameTitle", "")),
        "hardcore": str(entry.get("HardcoreMode", entry.get("hardcoreMode", 0))) in ("1", "True"),
    }


def select_new_unlocks(
    entries: Iterable[object],
    seen: Collection[str],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Pure: which of these unlocks have we not already reported?

    Returns the new entries oldest-first (so toasts arrive in the order they were
    earned) alongside their keys.
    """
    already = set(seen)
    fresh: list[dict[str, Any]] = []
    keys: list[str] = []

    # RA returns most recent first; reverse so toasts fire chronologically.
    for raw in reversed(list(entries)):
        entry = as_dict(raw)
        if entry is None:
            continue
        key = unlock_key(entry)
        if key in already:
            continue
        already.add(key)
        fresh.append(entry)
        keys.append(key)

    return fresh, keys


def _no_keys() -> list[str]:
    """Named factory so the element type is explicit; bare `list` reads as
    `list[Unknown]` under strict type checking."""
    return []


@dataclass
class SeenState:
    """`primed` is what stops the first poll toasting your entire back catalogue."""

    primed: bool = False
    keys: list[str] = field(default_factory=_no_keys)


class SeenStore:
    """Persists reported unlocks so a plugin restart does not re-toast them."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def load(self) -> SeenState:
        try:
            decoded: object = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return SeenState()

        body = as_dict(decoded)
        if body is None:
            return SeenState()

        raw_keys = as_list(body.get("keys")) or []
        keys = [key for key in raw_keys if isinstance(key, str)]
        return SeenState(primed=body.get("primed") is True, keys=keys)

    def save(self, state: SeenState) -> None:
        # Keep only the most recent keys; the list is append-ordered.
        trimmed = state.keys[-MAX_SEEN_KEYS:]
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"primed": state.primed, "keys": trimmed}), encoding="utf-8")
            tmp.replace(self._path)
        except OSError:
            # Losing this file means at worst a repeated toast, never a crash.
            return


class UnlockWatcher:
    """Polls RA and emits one event per genuinely new unlock."""

    def __init__(
        self,
        fetch: Callable[[], Awaitable[Any]],
        emit: Callable[[dict[str, Any]], Awaitable[None]],
        store: SeenStore,
        logger: logging.Logger,
        *,
        poll_seconds: float = DEFAULT_POLL_SECONDS,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._fetch = fetch
        self._emit = emit
        self._store = store
        self._logger = logger
        self._poll_seconds = poll_seconds
        self._sleep = sleep
        self._task: asyncio.Task[None] | None = None

    async def poll_once(self) -> list[dict[str, Any]]:
        """One poll. Returns the payloads emitted, so tests can assert on them."""
        state = self._store.load()

        try:
            data = await self._fetch()
        except Exception as error:  # a transient failure must not kill the loop
            self._logger.warning("unlock poll failed: %s", error)
            return []

        entries = as_list(data) or []
        fresh, keys = select_new_unlocks(entries, state.keys)

        if not state.primed:
            # First poll after the setting was switched on: record what already
            # exists and stay silent. Otherwise enabling notifications would fire
            # a toast for every achievement earned in the last 15 minutes.
            self._store.save(SeenState(primed=True, keys=[*state.keys, *keys]))
            self._logger.info("unlock notifications primed with %d existing unlocks", len(keys))
            return []

        emitted: list[dict[str, Any]] = []
        for entry in fresh:
            payload = to_payload(entry)
            try:
                await self._emit(payload)
            except Exception as error:  # one bad emit must not lose the rest
                self._logger.warning("could not emit unlock: %s", error)
                continue
            emitted.append(payload)

        if keys:
            self._store.save(SeenState(primed=True, keys=[*state.keys, *keys]))

        return emitted

    async def run(self) -> None:
        self._logger.info("unlock watcher started (every %.0fs)", self._poll_seconds)
        try:
            while True:
                await self.poll_once()
                await self._sleep(self._poll_seconds)
        except asyncio.CancelledError:
            self._logger.info("unlock watcher stopped")
            raise

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        task = self._task
        self._task = None
        if task is None or task.done():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()
