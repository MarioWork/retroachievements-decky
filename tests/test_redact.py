from __future__ import annotations

from ra.redact import MASK, redact


def test_replaces_the_key_anywhere_in_the_string() -> None:
    url = "https://retroachievements.org/API/x.php?u=me&y=SUPERSECRET"
    assert redact(url, "SUPERSECRET") == f"https://retroachievements.org/API/x.php?u=me&y={MASK}"


def test_ignores_empty_and_very_short_secrets() -> None:
    # A 1-3 char "secret" would otherwise shred unrelated text.
    assert redact("hello", "") == "hello"
    assert redact("hello", "l") == "hello"


def test_handles_multiple_secrets() -> None:
    assert redact("a=1 b=2", "1", "2") == "a=1 b=2"
    assert redact("key=ABCD token=EFGH", "ABCD", "EFGH") == f"key={MASK} token={MASK}"
