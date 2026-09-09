"""One method per RetroAchievements endpoint.

Deliberately thin. This layer composes settings + cache + http and returns RA's
raw JSON; it does not model the domain. Parsing, validation, normalisation and
sorting all live in TypeScript (`src/services/parsers.ts`) so the browser dev
harness exercises the real shipping logic rather than a reimplementation.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import urllib.parse
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Final, cast

from ra.cache import DiskCache
from ra.errors import RaError
from ra.http import JsonGetter
from ra.jsonutil import as_dict
from ra.redact import redact
from ra.settings import PublicSettings, SettingsStore

BASE_URL: Final = "https://retroachievements.org"
API_PATH: Final = "/API"

TTL_PROFILE: Final = 300.0
TTL_SUMMARY: Final = 300.0
TTL_RECENT_ACHIEVEMENTS: Final = 60.0
TTL_RECENTLY_PLAYED: Final = 60.0
TTL_GAME_PROGRESS: Final = 60.0
TTL_MY_GAMES: Final = 600.0

# RA's documented ceilings. Clamping here rather than trusting the caller keeps a
# frontend bug from turning into a 500-item request loop against their servers.
MAX_RECENTLY_PLAYED: Final = 50
MAX_COMPLETION_PROGRESS: Final = 500

# Safety net so a bad Total from RA cannot spin us forever: 10 x 500 games.
MAX_COMPLETION_PAGES: Final = 10

# Failures we can paper over with expired cache. Auth and config must surface:
# silently serving old data would hide that the key stopped working.
RECOVERABLE_ERROR_KINDS: Final = frozenset({"network", "rateLimit", "parse"})


@dataclass(frozen=True, slots=True)
class Aged:
    """A payload plus what is imperfect about it.

    `stale_seconds` is set when it came from expired cache after a failure.
    `partial_total` is set when we could only fetch part of a paged collection --
    it carries the count RA said exists, so the UI can say what is missing rather
    than presenting a short list as though it were complete.
    """

    data: Any
    stale_seconds: float | None = None
    partial_total: int | None = None


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


class RaClient:
    def __init__(
        self,
        settings: SettingsStore,
        cache: DiskCache,
        http: JsonGetter,
        logger: logging.Logger,
    ) -> None:
        self._settings = settings
        self._cache = cache
        self._http = http
        self._logger = logger

    # ---------------------------------------------------------------- settings

    async def get_settings(self) -> PublicSettings:
        settings = await asyncio.to_thread(self._settings.load)
        return settings.public()

    async def save_settings(self, username: str, api_key: str) -> PublicSettings:
        """Validate the credentials against RA before persisting them.

        Saving first and failing later would leave the user on a dashboard that
        silently errors on every request.
        """
        username = username.strip()
        api_key = api_key.strip()
        if not username or not api_key:
            raise RaError.config("Enter both your username and your web API key.")

        data = await self._call("API_GetUserProfile.php", {"u": username, "y": api_key}, api_key)
        profile = as_dict(data)
        if profile is None or not profile.get("User"):
            raise RaError.auth("Those credentials did not work. Check the username and key.")

        settings = await asyncio.to_thread(self._settings.save, username, api_key)
        # Old cache entries belong to the previous account.
        await asyncio.to_thread(self._cache.clear)
        return settings.public()

    async def clear_settings(self) -> PublicSettings:
        await asyncio.to_thread(self._settings.clear)
        await asyncio.to_thread(self._cache.clear)
        return self._settings.load().public()

    async def set_notify_unlocks(self, enabled: bool) -> PublicSettings:
        settings = await asyncio.to_thread(self._settings.set_notify_unlocks, enabled)
        return settings.public()

    async def fetch_recent_unlocks_uncached(self, minutes: int) -> Any:
        """Live read for the unlock watcher.

        Deliberately bypasses the cache: a poller reading its own cached response
        would never see anything new.
        """
        settings = self._settings.load()
        if not settings.configured:
            raise RaError.config()
        return await self._call(
            "API_GetUserRecentAchievements.php",
            {"u": settings.username, "y": settings.api_key, "m": str(minutes)},
            settings.api_key,
        )

    # -------------------------------------------------------------- endpoints

    async def get_profile(self, *, force: bool = False) -> Aged:
        return await self._get("API_GetUserProfile.php", {}, ttl=TTL_PROFILE, force=force)

    async def get_user_summary(self, *, force: bool = False) -> Aged:
        # g/a zeroed: this endpoint is documented as slow and over-fetching. We
        # only want Rank and TotalRanked from it.
        return await self._get(
            "API_GetUserSummary.php", {"g": 0, "a": 0}, ttl=TTL_SUMMARY, force=force
        )

    async def get_recent_achievements(self, *, minutes: int = 43200, force: bool = False) -> Aged:
        return await self._get(
            "API_GetUserRecentAchievements.php",
            {"m": _clamp(minutes, 1, 60 * 24 * 365)},
            ttl=TTL_RECENT_ACHIEVEMENTS,
            force=force,
        )

    async def get_recently_played(
        self, *, count: int = 10, offset: int = 0, force: bool = False
    ) -> Aged:
        return await self._get(
            "API_GetUserRecentlyPlayedGames.php",
            {"c": _clamp(count, 1, MAX_RECENTLY_PLAYED), "o": max(0, offset)},
            ttl=TTL_RECENTLY_PLAYED,
            force=force,
        )

    async def get_my_games(self, *, force: bool = False) -> Aged:
        """Every game the user has progress on, following RA's paging.

        A single request caps at 500, so a large library would silently truncate
        if we only asked once. Pages are assembled here and cached as one entry.
        """
        settings = self._settings.load()
        if not settings.configured:
            raise RaError.config()

        cache_key = self._cache_key(settings.username, "my_games_all", {})
        if not force:
            cached = await asyncio.to_thread(self._cache.get, cache_key, TTL_MY_GAMES)
            if cached is not None:
                self._logger.debug("cache hit: my_games_all")
                return Aged(cached)

        results: list[Any] = []
        total = 0

        for page in range(MAX_COMPLETION_PAGES):
            try:
                data = await self._call(
                    "API_GetUserCompletionProgress.php",
                    {
                        "u": settings.username,
                        "y": settings.api_key,
                        "c": str(MAX_COMPLETION_PROGRESS),
                        "o": str(page * MAX_COMPLETION_PROGRESS),
                    },
                    settings.api_key,
                )
            except RaError as error:
                # Prefer the last complete copy over a short list that would look
                # complete. Failing that, return what we did get -- but labelled
                # with the real total, so the UI can say what is missing instead
                # of showing nothing at all.
                stale = await self._stale_fallback(cache_key, error, "my_games_all")
                if stale is not None:
                    return stale
                if not results:
                    raise
                self._logger.warning(
                    "completion progress incomplete: %d of %d games", len(results), total
                )
                return Aged(
                    {"Total": len(results), "Results": results},
                    partial_total=max(total, len(results)),
                )

            body = as_dict(data)
            if body is None:
                break

            reported: object = body.get("Total")
            if isinstance(reported, (int, str)):
                # RA has sent Total as both a number and a string; a non-numeric
                # one just means we fall back to the page-length check below.
                with contextlib.suppress(ValueError):
                    total = max(total, int(reported))

            chunk: object = body.get("Results")
            if not isinstance(chunk, list) or not chunk:
                break

            results.extend(cast("list[Any]", chunk))

            # Stop as soon as we have everything RA says exists, or the page came
            # back short (which also means there is no next page).
            if len(results) >= total or len(cast("list[Any]", chunk)) < MAX_COMPLETION_PROGRESS:
                break
        else:
            self._logger.warning(
                "stopped paging completion progress at %d games (page cap reached)", len(results)
            )

        payload = {"Total": max(total, len(results)), "Results": results}
        await asyncio.to_thread(self._cache.put, cache_key, payload)
        return Aged(payload)

    async def get_game_progress(self, game_id: int, *, force: bool = False) -> Aged:
        if game_id <= 0:
            raise RaError.not_found("That game id is not valid.")
        return await self._get(
            "API_GetGameInfoAndUserProgress.php",
            {"g": game_id, "a": 1},
            ttl=TTL_GAME_PROGRESS,
            force=force,
        )

    # --------------------------------------------------------------- internals

    async def _get(
        self,
        endpoint: str,
        params: Mapping[str, str | int],
        *,
        ttl: float,
        force: bool,
    ) -> Aged:
        settings = self._settings.load()
        if not settings.configured:
            raise RaError.config()

        query: dict[str, str] = {key: str(value) for key, value in params.items()}
        query["u"] = settings.username

        cache_key = self._cache_key(settings.username, endpoint, query)
        if not force:
            cached = await asyncio.to_thread(self._cache.get, cache_key, ttl)
            if cached is not None:
                self._logger.debug("cache hit: %s", endpoint)
                return Aged(cached)

        try:
            data = await self._call(endpoint, {**query, "y": settings.api_key}, settings.api_key)
        except RaError as error:
            stale = await self._stale_fallback(cache_key, error, endpoint)
            if stale is None:
                raise
            return stale

        await asyncio.to_thread(self._cache.put, cache_key, data)
        return Aged(data)

    async def _stale_fallback(self, cache_key: str, error: RaError, endpoint: str) -> Aged | None:
        """Expired cache is better than an error screen -- but only when the
        failure was transient. A rejected key must surface, or the user would
        never learn their credentials stopped working."""
        if error.kind not in RECOVERABLE_ERROR_KINDS:
            return None

        found = await asyncio.to_thread(self._cache.get_stale, cache_key)
        if found is None:
            return None

        value, age = found
        self._logger.info("serving stale %s (%.0fs old) after %s", endpoint, age, error.kind)
        return Aged(value, stale_seconds=age)

    async def _call(self, endpoint: str, params: Mapping[str, str], api_key: str) -> Any:
        try:
            data = await self._http.get_json(f"{API_PATH}/{endpoint}", params)
        except RaError as error:
            self._logger.warning("%s failed: %s", endpoint, redact(error.message, api_key))
            raise

        self._raise_for_api_error(data)
        return data

    @staticmethod
    def _cache_key(username: str, endpoint: str, query: Mapping[str, str]) -> str:
        # The API key is never part of the key -- it must not reach a filename.
        stable = urllib.parse.urlencode(sorted(query.items()))
        return f"{username}|{endpoint}|{stable}"

    @staticmethod
    def _raise_for_api_error(data: object) -> None:
        """RA sometimes answers HTTP 200 with an error body instead of a status."""
        body = as_dict(data)
        if body is None:
            return
        message: object = body.get("Error") or body.get("error")
        if not isinstance(message, str) or not message:
            return
        lowered = message.lower()
        if "key" in lowered or "auth" in lowered or "credential" in lowered:
            raise RaError.auth("RetroAchievements rejected your API key.")
        raise RaError.network(message)
