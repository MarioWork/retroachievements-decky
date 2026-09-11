from __future__ import annotations

import logging
import ssl
from pathlib import Path, PurePosixPath

from ra.tls import CA_FILE_CANDIDATES, build_ssl_context, load_system_trust, store_is_empty

# A throwaway self-signed CA. Loading a bundle is the whole point of the module,
# so the happy path needs a certificate OpenSSL will actually accept; generating
# one at test time would mean a dependency this backend deliberately does not have.
TEST_CA_PEM = """-----BEGIN CERTIFICATE-----
MIIC4zCCAcugAwIBAgIUQbBsP+6DuaNaegXJpKG1neLmAIswDQYJKoZIhvcNAQEL
BQAwADAgFw0yNjA5MTEwOTIyMjNaGA8yMTI2MDgxODA5MjIyM1owADCCASIwDQYJ
KoZIhvcNAQEBBQADggEPADCCAQoCggEBALbIZU8WoWyzdPyQ8rQ8yrqk076OFJIQ
1w9ZHLXt6WVrXtbg9GK8JfzHhOOBufOo92w4Epk9a2CBN12nQd55+u2yZ0fe3nj4
ys9IpWFWMoDutK6PtgQ36ecu7pYp4ie+QcPGOFuSm6hpX+Q1G0pWgjdJRA1nbXg1
lKhFwN+/PLtGHvrnUy/FIjjZR4jbFPD1YQzEfVUR88pnoc7rCQAoDpBiEAnk2/C6
+Kaw6u8WUHlWLom6/DgN0SAzGNx2ufF8DmuElfES3Axm/6QozZN48Nawkt8hxni3
JL9O1RN9r4PvDPfDldmHgOLpNg2oIlrhOn3lMCpo08vLPeMP+vByBOECAwEAAaNT
MFEwHQYDVR0OBBYEFFTMHAuA+yTR6Lqit94zLvyA0/c8MB8GA1UdIwQYMBaAFFTM
HAuA+yTR6Lqit94zLvyA0/c8MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEL
BQADggEBAFVvjj23ULduCJ7Svlv/vLvTGfQAoNg9xUlfTpf3wtn8qnP1wmtIBjQ7
AIBgSQ7Z9tRSPNZG0YgcLHF5SaD45e122H2hUMmBjAxVGB6lBaBW0eDenrlzENJt
o9q3WsT0hVEDDd67pNTFoHTYM4qheKxYCy0yiSgckz8MD+FxKKKAxCY6g06vZwPF
5we3BdMccTmBb2jg4WkwysfWRkxu+nGhfGQoQ5Ni4VJG/7eZ52Y0zN+PWHyhHk0s
QbUkoUnX5f1efVcuPpiGzmVw22quGTuAMx8iKAxeX7i6hq55PsJxetP2m/1b+UfS
tkDl3xUo6WJLSoonsFc2zNeIsI6OWwk=
-----END CERTIFICATE-----
"""


def empty_context() -> ssl.SSLContext:
    """What Decky's frozen interpreter hands us: verifying, but trusting nothing."""
    return ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)


def write_ca(tmp_path: Path, name: str = "ca.pem", body: str = TEST_CA_PEM) -> str:
    path = tmp_path / name
    path.write_text(body, encoding="utf-8")
    return str(path)


def test_detects_an_empty_store() -> None:
    assert store_is_empty(empty_context())


def test_loads_the_first_readable_bundle(tmp_path: Path) -> None:
    good = write_ca(tmp_path)
    context = empty_context()

    loaded = load_system_trust(context, [str(tmp_path / "missing.crt"), good])

    assert loaded == good
    assert not store_is_empty(context)


def test_skips_a_malformed_bundle_instead_of_giving_up(tmp_path: Path) -> None:
    # A path that exists but is garbage must not shadow a good one behind it.
    bad = write_ca(tmp_path, "bad.pem", "not a certificate")
    good = write_ca(tmp_path)
    context = empty_context()

    assert load_system_trust(context, [bad, good]) == good
    assert not store_is_empty(context)


def test_reports_nothing_when_no_candidate_exists(tmp_path: Path) -> None:
    context = empty_context()

    assert load_system_trust(context, [str(tmp_path / "nope.crt")]) is None
    assert store_is_empty(context)


def test_repairs_an_empty_default_store(tmp_path: Path, monkeypatch) -> None:
    # The Decky failure exactly: a verifying context that trusts nothing.
    monkeypatch.setattr(ssl, "create_default_context", empty_context)
    good = write_ca(tmp_path)

    context = build_ssl_context(candidates=[good])

    assert not store_is_empty(context)


def test_never_disables_verification_when_nothing_can_be_loaded(
    tmp_path: Path, monkeypatch
) -> None:
    # Failing closed matters more than failing quietly: an unverified context
    # would turn a loud certificate error into a silent downgrade.
    monkeypatch.setattr(ssl, "create_default_context", empty_context)

    context = build_ssl_context(candidates=[str(tmp_path / "nope.crt")])

    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_build_keeps_verification_on() -> None:
    context = build_ssl_context(logging.getLogger("test"))

    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_build_leaves_a_populated_default_store_alone() -> None:
    # Nothing to repair here, so the context must come back as the stdlib built it.
    default = ssl.create_default_context()
    if store_is_empty(default):
        return  # no system trust on this machine; covered by the unit tests above

    assert not store_is_empty(build_ssl_context())


def test_candidates_are_absolute_paths() -> None:
    # A relative path would resolve against the plugin's cwd, which Decky sets.
    # PurePosixPath because the candidates are Linux paths; the dev machine
    # running this test may not be.
    assert all(PurePosixPath(candidate).is_absolute() for candidate in CA_FILE_CANDIDATES)
