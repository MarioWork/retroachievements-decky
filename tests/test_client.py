"""RaClient behaviour, with the network stubbed out.

Uses `asyncio.run` rather than pytest-asyncio so CI needs only pytest + ruff.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from pathlib import Path
from typing import Any, TypeVar

import pytest

from ra.cache import DiskCache
from ra.client import MAX_COMPLETION_PAGES, MAX_RECENTLY_PLAYED, RaClient
from ra.errors import RaError
from ra.settings import SettingsStore

T = TypeVar("T")

API_KEY = "SUPERSECRETKEY"


def run(coro: asyncio.Future[T] | Any) -> T:
    return asyncio.run(coro)


class StubHttp:
    """Records every call and replays queued responses."""

    def __init__(self, *responses: Any) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[str, dict[str, str]]] = []

    async def get_json(self, path: str, params: Mapping[str, str]) -> Any:
        self.calls.append((path, dict(params)))
        if not self._responses:
            return {"User": "Mario"}
        return self._responses.pop(0)


class ExplodingHttp:
    def __init__(self, error: Exception) -> None:
        self._error = error
        self.calls = 0

    async def get_json(self, path: str, params: Mapping[str, str]) -> Any:
        self.calls += 1
        raise self._error


def build(
    tmp_path: Path,
    http: Any,
    *,
    configured: bool = True,
) -> tuple[RaClient, SettingsStore, DiskCache]:
    settings = SettingsStore(tmp_path / "settings.json")
    if configured:
        settings.save("Mario", API_KEY)
    cache = DiskCache(tmp_path / "cache")
    client = RaClient(settings, cache, http, logging.getLogger("test"))
    return client, settings, cache


# ------------------------------------------------------------------ settings


def test_requires_configuration_before_any_endpoint(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, StubHttp(), configured=False)
    with pytest.raises(RaError) as excinfo:
        run(client.get_profile())
    assert excinfo.value.kind == "config"


def test_save_settings_validates_before_persisting(tmp_path: Path) -> None:
    # RA answering without a User field means the credentials are no good.
    http = StubHttp({"User": None})
    client, settings, _ = build(tmp_path, http, configured=False)

    with pytest.raises(RaError) as excinfo:
        run(client.save_settings("Mario", "BADKEY"))

    assert excinfo.value.kind == "auth"
    assert settings.load().configured is False, "must not persist credentials that failed"


def test_save_settings_persists_on_success(tmp_path: Path) -> None:
    client, settings, _ = build(tmp_path, StubHttp({"User": "Mario"}), configured=False)
    public = run(client.save_settings("Mario", API_KEY))

    assert public == {"username": "Mario", "has_key": True, "notify_unlocks": False}
    assert settings.load().api_key == API_KEY


def test_save_settings_rejects_blank_input(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, StubHttp(), configured=False)
    with pytest.raises(RaError) as excinfo:
        run(client.save_settings("  ", ""))
    assert excinfo.value.kind == "config"


def test_clear_settings_wipes_credentials(tmp_path: Path) -> None:
    client, settings, _ = build(tmp_path, StubHttp())
    public = run(client.clear_settings())
    assert public == {"username": "", "has_key": False, "notify_unlocks": False}
    assert settings.load().configured is False


# --------------------------------------------------------------------- auth


def test_the_api_key_is_sent_but_never_reaches_the_cache_key(tmp_path: Path) -> None:
    http = StubHttp({"User": "Mario"})
    client, _, _ = build(tmp_path, http)
    run(client.get_profile())

    _, params = http.calls[0]
    assert params["y"] == API_KEY, "the key must still be sent to RA"

    cached_files = list((tmp_path / "cache").glob("*.json"))
    assert cached_files, "the response should have been cached"
    for file in cached_files:
        assert API_KEY not in file.name
        assert API_KEY not in file.read_text(encoding="utf-8")


def test_username_is_sent_on_every_request(tmp_path: Path) -> None:
    http = StubHttp({"ID": 1})
    client, _, _ = build(tmp_path, http)
    run(client.get_game_progress(504))
    _, params = http.calls[0]
    assert params["u"] == "Mario"
    assert params["g"] == "504"
    assert params["a"] == "1"


# -------------------------------------------------------------------- cache


def test_second_call_is_served_from_cache(tmp_path: Path) -> None:
    http = StubHttp({"User": "Mario"}, {"User": "SHOULD-NOT-BE-USED"})
    client, _, _ = build(tmp_path, http)

    first = run(client.get_profile())
    second = run(client.get_profile())

    assert first.data == second.data == {"User": "Mario"}
    assert len(http.calls) == 1


def test_force_bypasses_the_cache(tmp_path: Path) -> None:
    http = StubHttp({"User": "old"}, {"User": "new"})
    client, _, _ = build(tmp_path, http)

    run(client.get_profile())
    refreshed = run(client.get_profile(force=True))

    assert refreshed.data == {"User": "new"}
    assert len(http.calls) == 2


def test_different_endpoints_do_not_share_a_cache_entry(tmp_path: Path) -> None:
    http = StubHttp({"a": 1}, {"b": 2})
    client, _, _ = build(tmp_path, http)

    assert run(client.get_profile()).data == {"a": 1}
    assert run(client.get_user_summary()).data == {"b": 2}


def test_saving_new_credentials_clears_the_old_account_cache(tmp_path: Path) -> None:
    http = StubHttp({"User": "Mario"}, {"User": "Someone"}, {"User": "fresh"})
    client, _, cache = build(tmp_path, http)

    run(client.get_profile())
    run(client.save_settings("Someone", "OTHERKEY123"))

    assert not list((tmp_path / "cache").glob("*.json"))
    assert cache.get("anything", ttl=60) is None


# ------------------------------------------------------------------- errors


def test_error_body_with_a_key_hint_maps_to_auth(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, StubHttp({"Error": "Invalid API key"}))
    with pytest.raises(RaError) as excinfo:
        run(client.get_profile())
    assert excinfo.value.kind == "auth"


def test_other_error_bodies_map_to_network(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, StubHttp({"Error": "Something broke"}))
    with pytest.raises(RaError) as excinfo:
        run(client.get_profile())
    assert excinfo.value.kind == "network"


def test_a_failed_request_is_not_cached(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, ExplodingHttp(RaError.network()))
    with pytest.raises(RaError):
        run(client.get_profile())
    assert not list((tmp_path / "cache").glob("*.json"))


def test_rejects_a_nonsense_game_id(tmp_path: Path) -> None:
    http = StubHttp()
    client, _, _ = build(tmp_path, http)
    with pytest.raises(RaError) as excinfo:
        run(client.get_game_progress(0))
    assert excinfo.value.kind == "notFound"
    assert http.calls == [], "must not hit the network for an invalid id"


# ------------------------------------------------------------------ clamping


def test_recently_played_count_is_clamped_to_the_documented_max(tmp_path: Path) -> None:
    http = StubHttp([])
    client, _, _ = build(tmp_path, http)
    run(client.get_recently_played(count=9999))
    _, params = http.calls[0]
    assert params["c"] == str(MAX_RECENTLY_PLAYED)


def test_negative_offset_is_clamped_to_zero(tmp_path: Path) -> None:
    http = StubHttp([])
    client, _, _ = build(tmp_path, http)
    run(client.get_recently_played(offset=-5))
    _, params = http.calls[0]
    assert params["o"] == "0"


# ------------------------------------------------------------------- paging


def _page(total: int, ids: list[int]) -> dict[str, Any]:
    return {"Total": total, "Results": [{"GameID": i} for i in ids]}


def test_my_games_follows_every_page(tmp_path: Path) -> None:
    # A single request caps at 500, so a large library would silently truncate.
    full = list(range(500))
    http = StubHttp(_page(600, full), _page(600, list(range(500, 600))))
    client, _, _ = build(tmp_path, http)

    result = run(client.get_my_games())

    assert len(result.data["Results"]) == 600
    assert result.data["Total"] == 600
    assert len(http.calls) == 2
    assert http.calls[0][1]["o"] == "0"
    assert http.calls[1][1]["o"] == "500"


def test_my_games_stops_on_a_short_page(tmp_path: Path) -> None:
    http = StubHttp(_page(3, [1, 2, 3]))
    client, _, _ = build(tmp_path, http)

    result = run(client.get_my_games())

    assert len(result.data["Results"]) == 3
    assert len(http.calls) == 1, "a short page means there is no next page"


def test_my_games_stops_on_an_empty_page(tmp_path: Path) -> None:
    http = StubHttp(_page(9999, []))
    client, _, _ = build(tmp_path, http)

    result = run(client.get_my_games())

    assert result.data["Results"] == []
    assert len(http.calls) == 1


def test_my_games_caps_paging_so_a_bad_total_cannot_loop_forever(tmp_path: Path) -> None:
    # RA claiming a huge Total while returning full pages must not spin.
    pages = [_page(10**9, list(range(500))) for _ in range(50)]
    http = StubHttp(*pages)
    client, _, _ = build(tmp_path, http)

    run(client.get_my_games())

    assert len(http.calls) == MAX_COMPLETION_PAGES


def test_my_games_is_cached_as_one_entry(tmp_path: Path) -> None:
    http = StubHttp(_page(2, [1, 2]), _page(2, [9, 9]))
    client, _, _ = build(tmp_path, http)

    first = run(client.get_my_games())
    second = run(client.get_my_games())

    assert first == second
    assert len(http.calls) == 1


def test_my_games_requires_configuration(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, StubHttp(), configured=False)
    with pytest.raises(RaError) as excinfo:
        run(client.get_my_games())
    assert excinfo.value.kind == "config"


# ------------------------------------------------------------- stale fallback


def test_serves_expired_cache_when_the_network_fails(tmp_path: Path) -> None:
    # On a handheld away from wifi, old data beats an error screen.
    http = StubHttp({"User": "Mario"})
    client, _, _ = build(tmp_path, http)
    run(client.get_profile())

    offline = ExplodingHttp(RaError.network())
    client_offline, _, _ = build(tmp_path, offline)
    result = run(client_offline.get_profile(force=True))

    assert result.data == {"User": "Mario"}
    assert result.stale_seconds is not None, "the UI must be able to say how old this is"


def test_a_live_response_is_not_marked_stale(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, StubHttp({"User": "Mario"}))
    assert run(client.get_profile()).stale_seconds is None


def test_an_auth_failure_is_never_papered_over(tmp_path: Path) -> None:
    # Serving old data here would hide that the key stopped working.
    http = StubHttp({"User": "Mario"})
    client, _, _ = build(tmp_path, http)
    run(client.get_profile())

    client_bad, _, _ = build(tmp_path, ExplodingHttp(RaError.auth()))
    with pytest.raises(RaError) as excinfo:
        run(client_bad.get_profile(force=True))
    assert excinfo.value.kind == "auth"


def test_a_network_failure_with_no_cache_still_raises(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, ExplodingHttp(RaError.network()))
    with pytest.raises(RaError) as excinfo:
        run(client.get_profile())
    assert excinfo.value.kind == "network"


def test_my_games_falls_back_rather_than_returning_partial_pages(tmp_path: Path) -> None:
    # A half-filled list would look complete while silently missing games.
    http = StubHttp(_page(2, [1, 2]))
    client, _, _ = build(tmp_path, http)
    run(client.get_my_games())

    client_offline, _, _ = build(tmp_path, ExplodingHttp(RaError.network()))
    result = run(client_offline.get_my_games(force=True))

    assert len(result.data["Results"]) == 2
    assert result.stale_seconds is not None


class FailAfter:
    """Serves N pages, then fails -- a connection dropping mid-paging."""

    def __init__(self, *pages: Any, error: RaError) -> None:
        self._pages = list(pages)
        self._error = error
        self.calls = 0

    async def get_json(self, path: str, params: Mapping[str, str]) -> Any:
        self.calls += 1
        if not self._pages:
            raise self._error
        return self._pages.pop(0)


def test_partial_library_is_returned_labelled_rather_than_lost(tmp_path: Path) -> None:
    # With nothing cached, some games plus an honest label beats an error screen.
    http = FailAfter(_page(900, list(range(500))), error=RaError.network())
    client, _, _ = build(tmp_path, http)

    result = run(client.get_my_games())

    assert len(result.data["Results"]) == 500
    assert result.partial_total == 900, "the UI must be able to say what is missing"
    assert result.data["Total"] == 500, "Total must match what is actually included"


def test_a_complete_library_is_not_marked_partial(tmp_path: Path) -> None:
    client, _, _ = build(tmp_path, StubHttp(_page(2, [1, 2])))
    assert run(client.get_my_games()).partial_total is None


def test_cache_is_preferred_over_a_partial_result(tmp_path: Path) -> None:
    # A complete older copy is more useful than a fresh half of one.
    client, _, _ = build(tmp_path, StubHttp(_page(3, [1, 2, 3])))
    run(client.get_my_games())

    offline = FailAfter(_page(900, list(range(500))), error=RaError.network())
    client_offline, _, _ = build(tmp_path, offline)
    result = run(client_offline.get_my_games(force=True))

    assert len(result.data["Results"]) == 3
    assert result.stale_seconds is not None
    assert result.partial_total is None


def test_a_partial_result_is_not_cached(tmp_path: Path) -> None:
    # Caching half a library would poison later reads for the whole TTL.
    http = FailAfter(_page(900, list(range(500))), error=RaError.network())
    client, _, _ = build(tmp_path, http)
    run(client.get_my_games())

    assert not list((tmp_path / "cache").glob("*.json"))
