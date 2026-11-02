#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if ! node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    console.error("Node.js 22.5 or newer is required.");
    process.exit(1);
  }
'; then
  exit 1
fi

for service in backend frontend; do
  service_dir="$ROOT_DIR/project/$service"
  if [ ! -d "$service_dir/node_modules" ]; then
    npm --prefix "$service_dir" install
  fi
done

node "$ROOT_DIR/project/backend/server.js" &
BACKEND_PID=$!
node "$ROOT_DIR/project/frontend/server.js" &
FRONTEND_PID=$!

cleanup() {
  trap - EXIT INT TERM
  kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Bookmark Manager is starting."
echo "Open http://127.0.0.1:8080"

while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID" || true
    echo "The backend stopped unexpectedly." >&2
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    wait "$FRONTEND_PID" || true
    echo "The frontend stopped unexpectedly." >&2
    exit 1
  fi
  sleep 1
done
