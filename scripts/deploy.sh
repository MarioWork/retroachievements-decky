#!/usr/bin/env bash
# Builds the plugin and copies it to a Steam Deck over SSH.
#
# Usage:
#   ./scripts/deploy.sh 192.168.1.42
#   ./scripts/deploy.sh                 # reads DECK_HOST from deploy.env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# deploy.env is gitignored: DECK_HOST=192.168.1.42
if [[ -f deploy.env ]]; then
  # shellcheck disable=SC1091
  source deploy.env
fi

DECK_HOST="${1:-${DECK_HOST:-}}"
DECK_USER="${DECK_USER:-deck}"
PLUGIN_NAME="${PLUGIN_NAME:-retroachievements}"

if [[ -z "$DECK_HOST" ]]; then
  echo "No Deck host. Pass one as an argument or set DECK_HOST in deploy.env." >&2
  exit 1
fi

TARGET="${DECK_USER}@${DECK_HOST}"
REMOTE_DIR="~/homebrew/plugins/${PLUGIN_NAME}"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building"
  yarn build
fi

[[ -f dist/index.js ]] || { echo "dist/index.js is missing. Run the build first." >&2; exit 1; }

echo "==> Creating ${REMOTE_DIR} on ${TARGET}"
ssh "$TARGET" "mkdir -p ${REMOTE_DIR}"

# Exactly what Decky loads -- never node_modules, tests, or the dev harness.
PAYLOAD=(dist main.py py_modules plugin.json package.json LICENSE README.md)
EXISTING=()
for item in "${PAYLOAD[@]}"; do
  [[ -e "$item" ]] && EXISTING+=("$item")
done

echo "==> Copying"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete-excluded "${EXISTING[@]}" "${TARGET}:${REMOTE_DIR}/"
else
  scp -r "${EXISTING[@]}" "${TARGET}:${REMOTE_DIR}/"
fi

if [[ "${NO_RESTART:-0}" != "1" ]]; then
  echo "==> Restarting plugin_loader (needs your Deck password)"
  # -t allocates a TTY so sudo can prompt.
  ssh -t "$TARGET" "sudo systemctl restart plugin_loader"
fi

echo "==> Done. Open the Decky menu on your Deck."
