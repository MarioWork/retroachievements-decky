"""Decky RPC adapter for the RetroAchievements plugin.

Intentionally contains no logic. Decky appends `py_modules/` to `sys.path`, so
the backend proper lives in the `ra` package, which never imports `decky` and is
therefore unit-testable in CI without a Decky runtime.

Every route returns the `{"ok": ..., "data" | "error": ...}` envelope. An
exception allowed to escape here would reach the frontend as an opaque rejected
promise with no message the UI could act on.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import decky

from ra.cache import DiskCache
from ra.client import BASE_URL, Aged, RaClient
from ra.errors import RaError
from ra.http import HttpClient
from ra.result import Result, err, ok
from ra.settings import SettingsStore
from ra.unlockwatcher import EVENT_NAME, POLL_WINDOW_MINUTES, SeenStore, UnlockWatcher

SETTINGS_FILE = "settings.json"
CACHE_DIRNAME = "cache"
SEEN_FILE = "unlock_seen.json"


class Plugin:
    def __init__(self) -> None:
        self._client: RaClient | None = None
        self._watcher: UnlockWatcher | None = None

    # -------------------------------------------------------------- lifecycle

    async def _main(self) -> None:
        settings_path = Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / SETTINGS_FILE
        runtime_dir = Path(decky.DECKY_PLUGIN_RUNTIME_DIR)

        settings = SettingsStore(settings_path)
        client = RaClient(
            settings=settings,
            cache=DiskCache(runtime_dir / CACHE_DIRNAME),
            http=HttpClient(BASE_URL, logger=decky.logger),
            logger=decky.logger,
        )
        self._client = client

        self._watcher = UnlockWatcher(
            fetch=lambda: client.fetch_recent_unlocks_uncached(POLL_WINDOW_MINUTES),
            emit=self._emit_unlock,
            store=SeenStore(runtime_dir / SEEN_FILE),
            logger=decky.logger,
        )

        # Only poll if the user asked for it; the setting defaults to off.
        if settings.load().notify_unlocks:
            self._watcher.start()

        decky.logger.info("RetroAchievements plugin loaded")

    async def _unload(self) -> None:
        if self._watcher is not None:
            await self._watcher.stop()
        self._watcher = None
        self._client = None
        decky.logger.info("RetroAchievements plugin unloaded")

    @staticmethod
    async def _emit_unlock(payload: dict[str, Any]) -> None:
        await decky.emit(EVENT_NAME, payload)

    async def _uninstall(self) -> None:
        decky.logger.info("RetroAchievements plugin uninstalled")

    # ----------------------------------------------------------------- routes

    async def get_settings(self) -> Result:
        return await self._run(lambda client: client.get_settings())

    async def save_settings(self, username: str, api_key: str) -> Result:
        return await self._run(lambda client: client.save_settings(username, api_key))

    async def clear_settings(self) -> Result:
        if self._watcher is not None:
            await self._watcher.stop()
        return await self._run(lambda client: client.clear_settings())

    async def set_notify_unlocks(self, enabled: bool) -> Result:
        result = await self._run(lambda client: client.set_notify_unlocks(bool(enabled)))

        # Only touch the task once the preference actually persisted.
        if result["ok"] and self._watcher is not None:
            if enabled:
                self._watcher.start()
            else:
                await self._watcher.stop()

        return result

    async def get_profile(self, force: bool = False) -> Result:
        return await self._run(lambda client: client.get_profile(force=force))

    async def get_user_summary(self, force: bool = False) -> Result:
        return await self._run(lambda client: client.get_user_summary(force=force))

    async def get_recent_achievements(self, minutes: int = 43200, force: bool = False) -> Result:
        return await self._run(
            lambda client: client.get_recent_achievements(minutes=int(minutes), force=force)
        )

    async def get_recently_played(
        self, count: int = 10, offset: int = 0, force: bool = False
    ) -> Result:
        return await self._run(
            lambda client: client.get_recently_played(
                count=int(count), offset=int(offset), force=force
            )
        )

    async def get_my_games(self, force: bool = False) -> Result:
        return await self._run(lambda client: client.get_my_games(force=force))

    async def get_game_progress(self, game_id: int, force: bool = False) -> Result:
        return await self._run(lambda client: client.get_game_progress(int(game_id), force=force))

    # --------------------------------------------------------------- internals

    async def _run(self, factory: Callable[[RaClient], Awaitable[Any]]) -> Result:
        client = self._client
        if client is None:
            return err(RaError.unexpected("The plugin backend is still starting up."))
        try:
            value = await factory(client)
            # Cached endpoints answer with Aged so the UI can say how old the
            # data is; settings routes return plain values.
            if isinstance(value, Aged):
                return ok(value.data, value.stale_seconds, value.partial_total)
            return ok(value)
        except RaError as error:
            return err(error)
        except Exception as error:  # nothing may cross the RPC boundary
            decky.logger.exception("unhandled error in a backend route")
            return err(RaError.unexpected(str(error)))
