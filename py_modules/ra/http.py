"""Thin JSON-over-HTTP client built on the standard library.

Stdlib only on purpose: Decky requires third-party packages to be vendored into
`py_modules/`, and `urllib` covers everything this plugin needs. Every blocking
call is pushed onto a worker thread so the plugin's event loop is never stalled.
"""

from __future__ import annotations

import asyncio
import json
import logging
import ssl
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from typing import Any, Final, Protocol

from ra.errors import RaError
from ra.tls import build_ssl_context

DEFAULT_TIMEOUT: Final = 15.0
USER_AGENT: Final = "retroachievements-decky-plugin/0.1.1"


def status_to_error(status: int) -> RaError:
    if status in (401, 403):
        return RaError.auth()
    if status == 404:
        return RaError.not_found()
    if status == 429:
        return RaError.rate_limit()
    if status >= 500:
        return RaError.network(f"RetroAchievements is having trouble (HTTP {status}).")
    return RaError.network(f"Unexpected response from RetroAchievements (HTTP {status}).")


class JsonGetter(Protocol):
    """What `RaClient` actually depends on.

    Depending on the protocol rather than the concrete class lets the tests
    inject a stub without touching the network.
    """

    async def get_json(self, path: str, params: Mapping[str, str]) -> Any: ...


class HttpClient(JsonGetter):
    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        user_agent: str = USER_AGENT,
        logger: logging.Logger | None = None,
        context: ssl.SSLContext | None = None,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._user_agent = user_agent
        # Built once at construction: Decky's frozen interpreter needs the trust
        # store repaired before the first request, not on every one.
        self._context = context or build_ssl_context(logger)

    async def get_json(self, path: str, params: Mapping[str, str]) -> Any:
        query = urllib.parse.urlencode(params)
        url = f"{self._base}/{path.lstrip('/')}?{query}"
        return await asyncio.to_thread(self._get_json_blocking, url)

    def _get_json_blocking(self, url: str) -> Any:
        request = urllib.request.Request(  # noqa: S310 -- scheme is fixed by the module-level base URL
            url,
            headers={"User-Agent": self._user_agent, "Accept": "application/json"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(  # noqa: S310
                request, timeout=self._timeout, context=self._context
            ) as response:
                body: str = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as error:
            raise status_to_error(error.code) from error
        except TimeoutError as error:
            raise RaError.network("RetroAchievements timed out.") from error
        except urllib.error.URLError as error:
            raise RaError.network(f"Could not reach RetroAchievements: {error.reason}") from error
        except OSError as error:
            raise RaError.network(f"Could not reach RetroAchievements: {error}") from error

        try:
            return json.loads(body)
        except ValueError as error:
            raise RaError.parse() from error
