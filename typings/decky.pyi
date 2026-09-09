"""Local stub for the `decky` module injected by Decky Loader at runtime.

Decky provides this module in-process, so it is not installable and pyright
cannot see it. Mirrors decky-loader's own `decky.pyi` -- keeping it here means
our *use* of decky is type-checked rather than silently Unknown.
"""

import logging
from typing import Any

HOME: str
USER: str
DECKY_VERSION: str
DECKY_USER: str
DECKY_USER_HOME: str
DECKY_HOME: str
DECKY_PLUGIN_SETTINGS_DIR: str
DECKY_PLUGIN_RUNTIME_DIR: str
DECKY_PLUGIN_LOG_DIR: str
DECKY_PLUGIN_DIR: str
DECKY_PLUGIN_NAME: str
DECKY_PLUGIN_VERSION: str
DECKY_PLUGIN_AUTHOR: str
DECKY_PLUGIN_LOG: str

logger: logging.Logger

def migrate_any(target_dir: str, *files_or_directories: str) -> dict[str, str]: ...
def migrate_settings(*files_or_directories: str) -> dict[str, str]: ...
def migrate_runtime(*files_or_directories: str) -> dict[str, str]: ...
def migrate_logs(*files_or_directories: str) -> dict[str, str]: ...
async def emit(event: str, *args: Any) -> None: ...
