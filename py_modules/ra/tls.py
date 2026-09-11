"""TLS trust for the plugin's HTTPS requests.

Decky ships as a PyInstaller bundle and plugin backends run under that frozen
interpreter, whose OpenSSL was compiled somewhere other than the Deck. The
certificate directory baked into it at build time does not exist on SteamOS, so
`ssl.create_default_context()` can come back with an *empty* trust store and
every request dies with "certificate verify failed: unable to get local issuer
certificate" -- which reads like a network outage but is really a missing CA
bundle.

So: build the default context, notice when it trusts nothing, and point it at
the CA bundle SteamOS actually ships. Verification is never weakened; an
unverified context would turn a loud, confusing failure into a silent one.
"""

from __future__ import annotations

import logging
import ssl
from collections.abc import Sequence
from pathlib import Path
from typing import Final

# Where distributions keep the system trust store. The first entry is the one
# that matters on a Deck (SteamOS is Arch); the rest cost nothing and keep this
# working for anyone running the backend on another distribution.
CA_FILE_CANDIDATES: Final[tuple[str, ...]] = (
    "/etc/ssl/certs/ca-certificates.crt",  # Arch (SteamOS), Debian, Ubuntu
    "/etc/pki/tls/certs/ca-bundle.crt",  # Fedora, RHEL
    "/etc/ssl/cert.pem",  # Alpine, FreeBSD
)


def store_is_empty(context: ssl.SSLContext) -> bool:
    """True when the context would reject every certificate chain.

    `load_default_certs()` fails silently when OpenSSL's compiled-in paths are
    missing, so an empty store is the only evidence that it happened.
    """
    return context.cert_store_stats()["x509_ca"] == 0


def load_system_trust(context: ssl.SSLContext, candidates: Sequence[str]) -> str | None:
    """Load the first readable CA bundle into `context`; return which one."""
    for candidate in candidates:
        if not Path(candidate).is_file():
            continue
        try:
            context.load_verify_locations(cafile=candidate)
        except (OSError, ssl.SSLError):
            # Present but unreadable or malformed -- try the next one rather
            # than giving up on a single bad path.
            continue
        if not store_is_empty(context):
            return candidate
    return None


def _load_certifi(context: ssl.SSLContext) -> str | None:
    """Last resort: the bundle Decky's own loader carries.

    Not a dependency -- if it is importable we are running inside the Decky
    bundle and may as well use what it already trusts.
    """
    try:
        # Imported here rather than at module scope: optional, and only
        # reachable once the system store has already come up empty.
        import certifi
    except ImportError:
        return None

    where: str = certifi.where()
    try:
        context.load_verify_locations(cafile=where)
    except (OSError, ssl.SSLError):
        return None
    return None if store_is_empty(context) else where


def build_ssl_context(
    logger: logging.Logger | None = None,
    candidates: Sequence[str] = CA_FILE_CANDIDATES,
) -> ssl.SSLContext:
    """A verifying context that also works under Decky's frozen interpreter."""
    log = logger or logging.getLogger(__name__)
    context = ssl.create_default_context()
    if not store_is_empty(context):
        return context

    source = load_system_trust(context, candidates) or _load_certifi(context)
    if source is None:
        # Nothing to load. Returning the empty context keeps the failure honest:
        # the request will fail closed with the certificate error rather than
        # quietly talking to whoever answers.
        log.error("no CA bundle found; HTTPS will fail. Tried: %s", ", ".join(candidates))
    else:
        log.info("default trust store was empty; using CA bundle at %s", source)
    return context
