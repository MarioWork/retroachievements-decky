"""Keep the API key out of logs.

Every string headed for the logger passes through here. The key is a query
parameter, so it would otherwise land in any URL we logged.
"""

from __future__ import annotations

MASK = "***"


def redact(text: str, *secrets: str) -> str:
    for secret in secrets:
        # Guard against empty/short secrets replacing everything.
        if secret and len(secret) >= 4:
            text = text.replace(secret, MASK)
    return text
