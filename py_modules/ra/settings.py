"""Persistence for the RetroAchievements credentials.

This is the main reason the plugin has a Python backend at all: the API key is
written to a 0600 file owned by the `deck` user instead of living in Steam's
SharedJSContext localStorage, which every other installed Decky plugin can read.

`api_key` never leaves this process -- `public()` is what the frontend sees.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from ra.jsonutil import as_dict


class PublicSettings(TypedDict):
    username: str
    has_key: bool
    notify_unlocks: bool


@dataclass(frozen=True, slots=True)
class Settings:
    username: str = ""
    api_key: str = ""
    # Off by default: this is the only feature with an ongoing battery cost.
    notify_unlocks: bool = False

    @property
    def configured(self) -> bool:
        return bool(self.username and self.api_key)

    def public(self) -> PublicSettings:
        return {
            "username": self.username,
            "has_key": bool(self.api_key),
            "notify_unlocks": self.notify_unlocks,
        }


class SettingsStore:
    """Reads and writes a single small JSON file. Sync by design -- it is a few
    hundred bytes, and keeping it free of asyncio makes it trivial to test."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._cached: Settings | None = None

    @property
    def path(self) -> Path:
        return self._path

    def load(self) -> Settings:
        if self._cached is not None:
            return self._cached

        settings = Settings()
        if self._path.is_file():
            try:
                decoded: object = json.loads(self._path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                # A corrupt or unreadable settings file must not brick the plugin;
                # the user is sent back to the setup screen instead.
                decoded = None

            raw = as_dict(decoded)
            if raw is not None:
                username: object = raw.get("username")
                api_key: object = raw.get("api_key")
                settings = Settings(
                    username=username if isinstance(username, str) else "",
                    api_key=api_key if isinstance(api_key, str) else "",
                    notify_unlocks=raw.get("notify_unlocks") is True,
                )

        self._cached = settings
        return settings

    def save(self, username: str, api_key: str) -> Settings:
        """Replaces the credentials, preserving preferences that are not credentials."""
        return self._write(
            Settings(
                username=username.strip(),
                api_key=api_key.strip(),
                notify_unlocks=self.load().notify_unlocks,
            )
        )

    def set_notify_unlocks(self, enabled: bool) -> Settings:
        current = self.load()
        return self._write(
            Settings(
                username=current.username,
                api_key=current.api_key,
                notify_unlocks=enabled,
            )
        )

    def _write(self, settings: Settings) -> Settings:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            {
                "username": settings.username,
                "api_key": settings.api_key,
                "notify_unlocks": settings.notify_unlocks,
            }
        )

        # Create with 0600 already set rather than writing then chmod-ing, so the
        # key is never briefly world-readable.
        self._path.touch(mode=0o600, exist_ok=True)
        self._path.chmod(0o600)
        self._path.write_text(payload, encoding="utf-8")

        self._cached = settings
        return settings

    def clear(self) -> None:
        self._path.unlink(missing_ok=True)
        self._cached = Settings()
