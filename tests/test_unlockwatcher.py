"""Unlock watcher decision logic.

The loop itself and `decky.emit` are Deck-only, but everything that decides
*which* unlocks are new is pure and tested here.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, TypeVar

from ra.unlockwatcher import (
    MAX_SEEN_KEYS,
    SeenState,
    SeenStore,
    UnlockWatcher,
    select_new_unlocks,
    to_payload,
    unlock_key,
)

T = TypeVar("T")


def run(coro: Any) -> Any:
    return asyncio.run(coro)


def unlock(achievement_id: int, *, hardcore: int = 1, title: str = "Test") -> dict[str, Any]:
    return {
        "AchievementID": achievement_id,
        "HardcoreMode": hardcore,
        "Title": title,
        "Description": "Do the thing",
        "Points": 10,
        "BadgeName": "112233",
        "GameTitle": "Metroid Fusion",
        "Date": "2026-03-14 21:00:00",
    }


class StubFetch:
    def __init__(self, *responses: Any) -> None:
        self._responses = list(responses)
        self.calls = 0

    async def __call__(self) -> Any:
        self.calls += 1
        if not self._responses:
            return []
        return self._responses.pop(0)


class RecordingEmit:
    def __init__(self, fail_on: int | None = None) -> None:
        self.payloads: list[dict[str, Any]] = []
        self._fail_on = fail_on

    async def __call__(self, payload: dict[str, Any]) -> None:
        if self._fail_on is not None and payload.get("id") == self._fail_on:
            raise RuntimeError("emit failed")
        self.payloads.append(payload)


def build(tmp_path: Path, fetch: Any, emit: Any) -> tuple[UnlockWatcher, SeenStore]:
    store = SeenStore(tmp_path / "seen.json")
    watcher = UnlockWatcher(fetch, emit, store, logging.getLogger("test"))
    return watcher, store


# ------------------------------------------------------------------- keys


def test_hardcore_and_softcore_are_separate_events() -> None:
    # Earning softcore then hardcore is two genuine unlocks, not a duplicate.
    assert unlock_key(unlock(1, hardcore=0)) != unlock_key(unlock(1, hardcore=1))


def test_the_same_unlock_produces_a_stable_key() -> None:
    assert unlock_key(unlock(1)) == unlock_key(unlock(1))


def test_payload_carries_only_what_the_toast_needs() -> None:
    payload = to_payload(unlock(1, title="Charge Beam"))
    assert payload["title"] == "Charge Beam"
    assert payload["gameTitle"] == "Metroid Fusion"
    assert payload["points"] == 10
    assert payload["hardcore"] is True
    assert "Date" not in payload


# --------------------------------------------------------------- selection


def test_selects_only_unseen_entries() -> None:
    seen = [unlock_key(unlock(1))]
    fresh, keys = select_new_unlocks([unlock(1), unlock(2)], seen)
    assert [entry["AchievementID"] for entry in fresh] == [2]
    assert keys == [unlock_key(unlock(2))]


def test_returns_entries_oldest_first() -> None:
    # RA returns newest first; toasts should fire in the order they were earned.
    fresh, _ = select_new_unlocks([unlock(3), unlock(2), unlock(1)], [])
    assert [entry["AchievementID"] for entry in fresh] == [1, 2, 3]


def test_deduplicates_within_a_single_response() -> None:
    fresh, keys = select_new_unlocks([unlock(1), unlock(1)], [])
    assert len(fresh) == 1
    assert len(keys) == 1


def test_skips_entries_that_are_not_objects() -> None:
    fresh, _ = select_new_unlocks(["nonsense", None, unlock(1)], [])
    assert len(fresh) == 1


def test_empty_input_is_empty_output() -> None:
    assert select_new_unlocks([], []) == ([], [])


# ------------------------------------------------------------------ store


def test_seen_state_round_trips(tmp_path: Path) -> None:
    store = SeenStore(tmp_path / "seen.json")
    store.save(SeenState(primed=True, keys=["a", "b"]))
    loaded = store.load()
    assert loaded.primed is True
    assert loaded.keys == ["a", "b"]


def test_missing_state_is_unprimed(tmp_path: Path) -> None:
    assert SeenStore(tmp_path / "nope.json").load() == SeenState(primed=False, keys=[])


def test_corrupt_state_is_unprimed(tmp_path: Path) -> None:
    path = tmp_path / "seen.json"
    path.write_text("{ not json", encoding="utf-8")
    assert SeenStore(path).load().primed is False


def test_seen_keys_are_capped(tmp_path: Path) -> None:
    store = SeenStore(tmp_path / "seen.json")
    store.save(SeenState(primed=True, keys=[str(i) for i in range(MAX_SEEN_KEYS + 50)]))
    keys = store.load().keys
    assert len(keys) == MAX_SEEN_KEYS
    # The most recent survive, not the oldest.
    assert keys[-1] == str(MAX_SEEN_KEYS + 49)


# ---------------------------------------------------------------- polling


def test_first_poll_primes_silently(tmp_path: Path) -> None:
    # Switching notifications on must not toast your entire back catalogue.
    fetch = StubFetch([unlock(1), unlock(2)])
    emit = RecordingEmit()
    watcher, store = build(tmp_path, fetch, emit)

    emitted = run(watcher.poll_once())

    assert emitted == []
    assert emit.payloads == []
    assert store.load().primed is True
    assert len(store.load().keys) == 2


def test_second_poll_emits_only_the_new_unlock(tmp_path: Path) -> None:
    fetch = StubFetch([unlock(1)], [unlock(2), unlock(1)])
    emit = RecordingEmit()
    watcher, _ = build(tmp_path, fetch, emit)

    run(watcher.poll_once())  # primes
    emitted = run(watcher.poll_once())

    assert [payload["id"] for payload in emitted] == [2]
    assert [payload["id"] for payload in emit.payloads] == [2]


def test_an_unlock_is_never_toasted_twice(tmp_path: Path) -> None:
    fetch = StubFetch([], [unlock(1)], [unlock(1)])
    emit = RecordingEmit()
    watcher, _ = build(tmp_path, fetch, emit)

    run(watcher.poll_once())  # primes with nothing
    run(watcher.poll_once())  # emits 1
    run(watcher.poll_once())  # same entry still inside RA's window

    assert len(emit.payloads) == 1


def test_state_survives_a_restart(tmp_path: Path) -> None:
    emit = RecordingEmit()
    first, _ = build(tmp_path, StubFetch([], [unlock(1)]), emit)
    run(first.poll_once())
    run(first.poll_once())
    assert len(emit.payloads) == 1

    # A brand new watcher over the same state file, as after a plugin reload.
    second_emit = RecordingEmit()
    second, _ = build(tmp_path, StubFetch([unlock(1)]), second_emit)
    run(second.poll_once())

    assert second_emit.payloads == [], "a restart must not re-toast old unlocks"


def test_a_failed_fetch_is_swallowed(tmp_path: Path) -> None:
    class Failing:
        async def __call__(self) -> Any:
            raise RuntimeError("network down")

    watcher, store = build(tmp_path, Failing(), RecordingEmit())

    assert run(watcher.poll_once()) == []
    # It must also not prime off a failure, or real unlocks would be swallowed.
    assert store.load().primed is False


def test_a_non_list_response_is_ignored(tmp_path: Path) -> None:
    watcher, _ = build(tmp_path, StubFetch({"Error": "nope"}), RecordingEmit())
    assert run(watcher.poll_once()) == []


def test_one_failed_emit_does_not_lose_the_others(tmp_path: Path) -> None:
    # RA returns newest first, so this is 3 earned most recently, 1 earliest.
    fetch = StubFetch([], [unlock(3), unlock(2), unlock(1)])
    emit = RecordingEmit(fail_on=2)
    watcher, _ = build(tmp_path, fetch, emit)

    run(watcher.poll_once())  # primes
    emitted = run(watcher.poll_once())

    assert [payload["id"] for payload in emit.payloads] == [1, 3]
    assert [payload["id"] for payload in emitted] == [1, 3]
