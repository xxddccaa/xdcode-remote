#!/usr/bin/env bash
set -euo pipefail
task_repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_repo_dir"
pnpm install --frozen-lockfile
pnpm --filter happy build
mkdir -p "$HOME/.local/bin"
ln -sfn "$task_repo_dir/packages/happy-cli/bin/happy.mjs" "$HOME/.local/bin/xdcode-remote"
printf '%s\n' 'Installed ~/.local/bin/xdcode-remote. Add ~/.local/bin to PATH, configure your server URL, then authenticate.'
