from __future__ import annotations

from pathlib import Path

from ra.cache import DiskCache


class FakeClock:
    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def test_round_trips_a_value(tmp_path: Path) -> None:
    cache = DiskCache(tmp_path, now=FakeClock())
    cache.put("k", {"hello": "world"})
    assert cache.get("k", ttl=60) == {"hello": "world"}


def test_returns_none_for_a_missing_key(tmp_path: Path) -> None:
    assert DiskCache(tmp_path, now=FakeClock()).get("nope", ttl=60) is None


def test_expires_entries_past_the_ttl(tmp_path: Path) -> None:
    clock = FakeClock()
    cache = DiskCache(tmp_path, now=clock)
    cache.put("k", "value")

    clock.now += 59
    assert cache.get("k", ttl=60) == "value"

    clock.now += 2
    assert cache.get("k", ttl=60) is None


def test_survives_a_corrupt_entry(tmp_path: Path) -> None:
    cache = DiskCache(tmp_path, now=FakeClock())
    cache.put("k", "value")
    next(tmp_path.glob("*.json")).write_text("{not json", encoding="utf-8")
    assert cache.get("k", ttl=60) is None


def test_clear_removes_everything(tmp_path: Path) -> None:
    cache = DiskCache(tmp_path, now=FakeClock())
    cache.put("a", 1)
    cache.put("b", 2)
    cache.clear()
    assert cache.get("a", ttl=60) is None
    assert cache.get("b", ttl=60) is None


def test_put_is_a_no_op_when_the_directory_is_unwritable(tmp_path: Path) -> None:
    # A cache that cannot be written is a performance problem, not a crash.
    blocker = tmp_path / "blocked"
    blocker.write_text("i am a file, not a directory", encoding="utf-8")
    cache = DiskCache(blocker, now=FakeClock())
    cache.put("k", "value")
    assert cache.get("k", ttl=60) is None


def test_get_stale_returns_expired_entries_with_their_age(tmp_path: Path) -> None:
    clock = FakeClock()
    cache = DiskCache(tmp_path, now=clock)
    cache.put("k", "value")

    clock.now += 3600
    assert cache.get("k", ttl=60) is None, "still expired for a normal read"

    found = cache.get_stale("k")
    assert found is not None
    value, age = found
    assert value == "value"
    assert age == 3600


def test_get_stale_returns_none_when_nothing_was_cached(tmp_path: Path) -> None:
    assert DiskCache(tmp_path, now=FakeClock()).get_stale("nope") is None


def test_age_is_never_negative_if_the_clock_moves_backwards(tmp_path: Path) -> None:
    clock = FakeClock()
    cache = DiskCache(tmp_path, now=clock)
    cache.put("k", "value")

    clock.now -= 500
    found = cache.get_stale("k")
    assert found is not None
    assert found[1] == 0
