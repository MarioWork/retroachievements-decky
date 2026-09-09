"""Tagged error type shared with the frontend.

`kind` is the contract: the TypeScript `AppError` union mirrors these exact
strings so the UI can map a bad key to "Check your API key" rather than
surfacing a raw HTTP status.
"""

from __future__ import annotations

from typing import Literal, TypedDict

ErrorKind = Literal[
    "config",  # no username / API key saved yet
    "auth",  # RA rejected the key
    "notFound",  # no such user or game
    "rateLimit",  # RA asked us to slow down
    "network",  # unreachable, timeout, or an unexpected status
    "parse",  # response was not the JSON we expected
    "unexpected",  # anything we failed to anticipate
]


class ErrorPayload(TypedDict):
    kind: ErrorKind
    message: str


class RaError(Exception):
    """An error that is safe to show the user.

    Messages must never contain the API key -- see `ra.redact`.
    """

    def __init__(self, kind: ErrorKind, message: str) -> None:
        super().__init__(message)
        self.kind: ErrorKind = kind
        self.message: str = message

    def to_dict(self) -> ErrorPayload:
        return {"kind": self.kind, "message": self.message}

    @classmethod
    def config(cls, message: str = "No RetroAchievements account configured.") -> RaError:
        return cls("config", message)

    @classmethod
    def auth(cls, message: str = "RetroAchievements rejected your API key.") -> RaError:
        return cls("auth", message)

    @classmethod
    def not_found(cls, message: str = "Not found on RetroAchievements.") -> RaError:
        return cls("notFound", message)

    @classmethod
    def rate_limit(cls, message: str = "RetroAchievements is rate limiting us.") -> RaError:
        return cls("rateLimit", message)

    @classmethod
    def network(cls, message: str = "Could not reach RetroAchievements.") -> RaError:
        return cls("network", message)

    @classmethod
    def parse(cls, message: str = "Unexpected response from RetroAchievements.") -> RaError:
        return cls("parse", message)

    @classmethod
    def unexpected(cls, message: str) -> RaError:
        return cls("unexpected", message)
