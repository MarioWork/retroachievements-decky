# RetroAchievements for Steam Deck

A [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin that puts your
RetroAchievements profile and per-game achievement progress in the Quick Access panel, so you can
check what you have left to unlock without leaving Game Mode.

> **This is a viewer, not an achievement client.** It does not unlock anything. Unlocks still
> happen in RetroArch or whichever emulator is logged into RetroAchievements; this plugin reads
> that data back through the RetroAchievements Web API.

## What it does

- **Dashboard** — avatar, points and rank, your recent unlocks, and your recently played games.
- **Game browser** — your whole library, filterable by title and console, sortable by recently
  played, closest to finish, most complete or title.
- **Game view** — a game's **complete** achievement list, unlocked and locked in one place.
  Unlocked entries show the colour badge, points and the date you earned them; locked entries show
  the greyed `_lock` badge and the description of what you still have to do. Sort by unlocked,
  locked or most recent, or filter down to only what is left. `34 / 56 · 61%` progress bar.
- **Unlock notifications** (optional, off by default) — a Steam toast when you earn something.
- **Works offline** — shows cached data labelled with its age when RetroAchievements is
  unreachable, rather than an error screen.

## Screenshots

_To add: dashboard and game view._

## Requirements

- A Steam Deck (or other SteamOS device) with [Decky Loader](https://decky.xyz) installed
- A [RetroAchievements](https://retroachievements.org) account

## Getting your API key

1. Sign in at [retroachievements.org](https://retroachievements.org).
2. Open **Settings** → the **Keys** section.
3. Copy the **web API key**.

The key can be regenerated at any time from that same page. It is not a password: it identifies
API traffic and grants no access to anything that is not already public on your profile.

## Install

This plugin is **not on the Decky store**, so install it by one of the routes below. All of them
work on a stock Deck with Decky Loader — nothing else is required.

### Option 1 — from a release zip (recommended, no PC needed)

Everything happens on the Deck itself, in Game Mode.

1. Copy the zip URL from the [latest release](../../releases/latest) — right-click
   `retroachievements.zip` → copy link. It looks like:

   ```
   https://github.com/MarioWork/retroachievements-decky/releases/latest/download/retroachievements.zip
   ```

2. On the Deck, open the **Decky** menu (the plug icon in Quick Access) and press the **gear**.
3. **General** → turn on **Developer mode**.
4. A **Developer** tab appears. Open it and find **Third-Party Plugins**.
5. Paste the URL into the field and press **Install**.

> Decky takes a **URL**, not a local file — SteamOS does not expose a file picker to it. If you
> build your own zip, it needs to be reachable over HTTP.

### Option 2 — copy it over SSH (for development)

Best if you are changing the code, since it redeploys in one command. Requires SSH on the Deck:

```bash
# On the Deck, in Desktop Mode:
passwd                            # set a password if the deck user has none
sudo systemctl enable --now sshd
ip addr show | grep 'inet '       # note the LAN IP
```

Then from your machine:

```bash
cp deploy.env.example deploy.env  # put the Deck's IP in it
./scripts/deploy.ps1              # Windows
./scripts/deploy.sh               # Git Bash / WSL / Linux
```

### Option 3 — build the zip yourself

```bash
yarn install && yarn build
mkdir -p out/retroachievements
cp -r dist main.py py_modules plugin.json package.json LICENSE README.md out/retroachievements/
cd out && zip -r ../retroachievements.zip retroachievements
```

The archive must contain a **single top-level folder** holding `plugin.json`, `dist/`, `main.py`
and `py_modules/`. That folder becomes the install directory under `~/homebrew/plugins/`; the name
shown in Decky comes from `plugin.json`, not from the folder.

To place it by hand instead, copy that folder to `~/homebrew/plugins/` on the Deck and restart the
loader:

```bash
sudo systemctl restart plugin_loader
```

### First run

Open the Decky menu, pick the trophy icon, and enter your RetroAchievements username and web API
key. The credentials are checked against RetroAchievements before they are saved, so a typo fails
immediately rather than quietly breaking every later request.

### Updating

Repeat whichever route you used. Installing over an existing copy is fine — your credentials live
in Decky's settings directory, not in the plugin folder, so they survive an update.

## Development

Requires **Node 22+**. Docker is not needed at all. Python 3.11 (plus `pip install ruff pytest`) is
only needed to run the backend's lint and tests — the plugin itself is standard-library only, so
there is nothing to install on the Deck.

```bash
yarn install       # Yarn 4
yarn dev           # browser dev harness
yarn test          # frontend unit tests
yarn test:py       # backend tests
yarn build         # produces dist/index.js
yarn check         # everything: types, lint, format, both test suites, build
```

> Yarn 4 is vendored: `.yarn/releases/yarn-4.18.0.cjs` is committed and `.yarnrc.yml` points
> `yarnPath` at it, so any `yarn` on your PATH (even Yarn 1) hands off to the right version. No
> corepack needed — which matters on Windows, where `corepack enable` needs an elevated shell to
> write into the Node install directory.
>
> `.yarnrc.yml` also sets `nodeLinker: node-modules`. Yarn's default PnP linker breaks rollup, vite
> and pyright, all of which resolve modules by walking `node_modules` on disk.

### The dev harness

`yarn dev` starts Vite and renders the **real** views, hooks, parsers and components in your
browser against your real RetroAchievements data. `vite.config.ts` aliases `@decky/ui` and
`@decky/api` to stand-ins under `src/dev/mocks/`, and proxies `/API/*` to retroachievements.org so
the browser's CORS check does not apply. No shipping file contains an `if (dev)` branch.

It covers layout, data fetching, parsing, and the loading / error / empty / loaded states. It
**cannot** cover exact Steam styling, gamepad focus order, Steam's CSP behaviour for remote
images, or `main.py` itself. Those are Deck-only — see the deploy step.

### Tests and checks

| Concern            | Tool                   | Command             |
| ------------------ | ---------------------- | ------------------- |
| TS types           | `tsc --noEmit`, strict | `yarn typecheck`    |
| TS lint            | ESLint, type-aware     | `yarn lint`         |
| Formatting         | Prettier               | `yarn format:check` |
| **Frontend tests** | **Vitest**             | `yarn test`         |
| **Python types**   | **pyright** (via npm)  | `yarn typecheck:py` |
| **Python lint**    | **ruff**               | `yarn lint:py`      |
| **Python format**  | **ruff format**        | `yarn format:py`    |
| **Python tests**   | **pytest**             | `yarn test:py`      |

`yarn check` runs all of them, and the same set runs in GitHub Actions
(`.github/workflows/ci.yml`).

The Python tools need Python 3.11 on your PATH plus `pip install ruff pytest`. pyright is the
exception — it ships its own stdlib stubs and type-checks the backend with no interpreter at all.

**Frontend tests (100)** live beside the code as `src/services/*.test.ts` and cover the parsing
layer — where the real risk is. RA's API is inconsistent about casing and about whether numbers
arrive as `34` or `"34"`, and the per-game endpoint returns achievements as an object keyed by id.
The suite pins down the unlocked-vs-locked determination (driven by the presence of `DateEarned`),
hardcore vs softcore, unlocked-first sorting, the `{ok, data|error}` envelope unwrapping, error-kind
mapping, and in-flight request de-duplication.

**Backend tests (73, 1 skipped on Windows)** are pytest under `tests/`, covering the disk cache's TTL and corruption
handling, the settings store's 0600 permissions and its guarantee that the API key never leaves the
backend, and the client's caching, auth-error mapping and parameter clamping.

## Deploying to your Deck

One-time SSH setup, in Desktop Mode on the Deck:

```bash
passwd                            # set a password for the deck user if you have not
sudo systemctl enable --now sshd
ip addr show | grep 'inet '       # note the LAN IP
```

Then, on your machine:

```bash
cp deploy.env.example deploy.env  # put your Deck's IP in it
./scripts/deploy.ps1              # Windows
./scripts/deploy.sh               # Git Bash / WSL / Linux
```

The script builds, copies only what Decky loads (`dist/`, `main.py`, `py_modules/`, the manifests)
and restarts `plugin_loader`. The restart prompts for your Deck password.

## Architecture

```
main.py                RPC adapter -- lifecycle + one 2-line method per route. No logic.
py_modules/ra/         the backend proper: settings, cache, http, client
    │
    │  {ok, data|error} envelope over Decky's Unix-socket RPC
    ▼
src/services/          callable() bindings, parsers, media URLs   (no React)
src/hooks/             loading/error state as a discriminated union
src/views/             one screen each
src/components/        presentational only
```

Dependencies flow one way. Components never fetch, views never build request params, services never
import React.

**The backend is deliberately thin.** In order of how much it actually justifies itself:

1. **Unlock notifications.** The only hard requirement. A plugin's frontend is mounted only while
   the Quick Access panel is open, so a `setInterval` there would stop polling precisely when you
   are playing. The watcher has to be a backend task.
2. **The HTTP call and disk cache.** Injecting `y=<key>` server-side sidesteps CORS and keeps the
   key out of the browser context; the cache survives a Steam restart, and serves stale data with
   its age when RetroAchievements is unreachable.
3. **Credential storage** at `DECKY_PLUGIN_SETTINGS_DIR/settings.json`, `chmod 0600`.
   `get_settings()` returns `{username, has_key}` and never the key.

> **On that last point, stated accurately:** `0600` does _not_ protect the key from other Decky
> plugins. Decky setuids every plugin to the same host user unless it carries the `root` flag, so
> another plugin can read this file exactly as it could read `localStorage`. The narrower benefit
> is that the key never enters Steam's SharedJSContext, and so is not exposed via CEF remote
> debugging — which Decky serves over the network on port 8081 while developer mode is on.
>
> An earlier version of this README claimed the file was protected from other plugins. That was
> wrong.

Everything else — parsing, validation, normalisation, sorting, all typing — is TypeScript. That is
why the dev harness is worth having: it exercises the real logic instead of a reimplementation.
`py_modules/ra/` never imports `decky` (the logger and directories are injected by `main.py`), which
is what makes the backend unit-testable in CI with no Decky runtime present.

### How authentication works

There is no login. The RetroAchievements Web API is not session-based; every request carries two
independent query parameters:

- `y=<web api key>` — identifies you as an API consumer
- `u=<username>` — selects whose data is being read

So "the logged-in user" is just the username you enter once. `API_GetGameInfoAndUserProgress`
returns every achievement for a game, with `DateEarned` present only on the ones that user has
unlocked — that field is what drives the unlocked-vs-locked rendering.

## Limitations

- **No global game search.** RetroAchievements' public API has no cross-site search
  (`API_GetGameList` requires a console id), so the browser lists the games _you_ have progress on
  and filters those by title. It cannot find a game you have never played.
- **No live unlock notifications.** Unlocks appear after a refresh, not the moment they happen.
- **No current-game detection.** The plugin does not know which ROM you are running; you pick the
  game yourself.

## Troubleshooting

- **Logs:** `~/homebrew/logs/retroachievements/` on the Deck.
- **Frontend debugging:** the CEF debugger at `http://<deck-ip>:8081` (Decky developer mode on).
- **"Check your username and API key"** means RetroAchievements rejected the credentials — the key
  is wrong, or it was regenerated. Re-enter it from Account settings.
- **A blank panel** is a bug; every state should render something. Check the logs.
- **Badge images not loading** points at Steam's CSP. All image URLs go through
  `getExternalResourceURL`; if you see broken tiles, that is where to look.

## License

BSD 3-Clause — see [LICENSE](LICENSE).

Not affiliated with or endorsed by RetroAchievements. The RetroAchievements name, API and image
assets belong to them.
