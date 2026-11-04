#!/usr/bin/env bash
set -euo pipefail

if ! grep -qi microsoft /proc/version; then
  echo "Run this script from a WSL distribution."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required. Install it with: sudo apt-get update && sudo apt-get install -y curl"
  exit 1
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null bash
fi

# nvm is a shell function, so load it for this script explicitly.
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "WSL development environment is ready."
echo "Node: $(node --version)"
echo "npm:  $(npm --version)"
echo "Project: $repo_root"
echo "Open this folder in VS Code from WSL with: code ."
