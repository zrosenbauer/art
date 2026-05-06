#!/usr/bin/env bash
# Idempotently ensure the asset viewer (TanStack Start app) is running on
# http://localhost:4321.
#
# - If port 4321 is already bound, do nothing (preserves the running watcher
#   and any open browser tab).
# - If not, spawn `pnpm --filter @art/viewer dev` from the repo root as a
#   detached daemon.
#
# Usage:
#   ensure-viewer.sh
#
# Exit codes: 0 = viewer running, 1 = failed to start.

set -e

PORT=4321
LOG=/tmp/art-asset-viewer.log

# Resolve repo root from this script's location: <repo>/.claude/skills/svg-creator/scripts/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

if lsof -ti:$PORT >/dev/null 2>&1; then
  echo "✓ asset viewer already running → http://localhost:$PORT"
  exit 0
fi

if [ ! -f "$REPO_ROOT/apps/viewer/package.json" ]; then
  echo "✗ apps/viewer/package.json not found at $REPO_ROOT" >&2
  exit 1
fi

echo "  starting asset viewer in $REPO_ROOT..."
( cd "$REPO_ROOT" && nohup pnpm --filter @art/viewer dev > "$LOG" 2>&1 < /dev/null & disown ) || true

# Vite + TanStack route generation can take ~3-6s on cold boot.
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25; do
  sleep 0.4
  if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "✓ asset viewer started → http://localhost:$PORT"
    echo "  log: $LOG"
    exit 0
  fi
done

echo "⚠ asset viewer did not bind to $PORT within 10s — check $LOG" >&2
exit 1
