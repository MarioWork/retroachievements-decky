"""RetroAchievements backend for the Decky plugin.

This package deliberately does NOT import `decky`. The logger and the settings /
runtime directories are injected by `main.py`, which keeps everything here
importable and unit-testable in CI without a Decky runtime present.
"""

from __future__ import annotations
