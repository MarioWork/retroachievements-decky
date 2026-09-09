from __future__ import annotations

import json
import stat
import sys
from pathlib import Path

import pytest

from ra.settings import Settings, SettingsStore


def test_defaults_to_unconfigured(tmp_path: Path) -> None:
    store = SettingsStore(tmp_path / "settings.json")
    settings = store.load()
    assert settings == Settings()
    assert settings.configured is False


def test_public_never_exposes_the_key(tmp_path: Path) -> None:
    store = SettingsStore(tmp_path / "settings.json")
    store.save("Mario", "SUPERSECRET")
    public = store.load().public()
    assert public == {"username": "Mario", "has_key": True, "notify_unlocks": False}
    assert "SUPERSECRET" not in json.dumps(public)


def test_save_then_load_round_trips(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    SettingsStore(path).save("Mario", "KEY123")
    # A fresh store proves it came off disk, not out of the in-memory cache.
    reloaded = SettingsStore(path).load()
    assert reloaded.username == "Mario"
    assert reloaded.api_key == "KEY123"
    assert reloaded.configured is True


def test_strips_surrounding_whitespace(tmp_path: Path) -> None:
    store = SettingsStore(tmp_path / "settings.json")
    store.save("  Mario \n", " KEY123 ")
    assert store.load() == Settings(username="Mario", api_key="KEY123")


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX permission bits")
def test_settings_file_is_owner_only(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    SettingsStore(path).save("Mario", "KEY123")
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_corrupt_file_falls_back_to_unconfigured(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    path.write_text("{ not json", encoding="utf-8")
    assert SettingsStore(path).load().configured is False


def test_wrongly_typed_fields_fall_back_to_unconfigured(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    path.write_text(json.dumps({"username": 42, "api_key": None}), encoding="utf-8")
    assert SettingsStore(path).load() == Settings()


def test_clear_removes_the_file(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    store = SettingsStore(path)
    store.save("Mario", "KEY123")
    store.clear()
    assert path.exists() is False
    assert store.load().configured is False


def test_notifications_default_to_off(tmp_path: Path) -> None:
    # The only feature with an ongoing battery cost must be opt-in.
    assert SettingsStore(tmp_path / "settings.json").load().notify_unlocks is False


def test_notification_preference_round_trips(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    store = SettingsStore(path)
    store.save("Mario", "KEY123")
    store.set_notify_unlocks(True)

    reloaded = SettingsStore(path).load()
    assert reloaded.notify_unlocks is True
    assert reloaded.username == "Mario", "toggling notifications must not drop credentials"
    assert reloaded.api_key == "KEY123"


def test_resaving_credentials_preserves_the_notification_preference(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    store = SettingsStore(path)
    store.set_notify_unlocks(True)
    store.save("Mario", "KEY123")

    assert SettingsStore(path).load().notify_unlocks is True
