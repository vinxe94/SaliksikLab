#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required but not installed."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but not installed."
  exit 1
fi

if [ ! -f "$BACKEND_DIR/manage.py" ]; then
  echo "Error: backend folder not found at $BACKEND_DIR"
  exit 1
fi

if [ ! -d "$BACKEND_DIR/venv" ]; then
  echo "Error: backend virtual environment not found at $BACKEND_DIR/venv"
  echo "Run once:"
  echo "  cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Error: frontend dependencies are not installed."
  echo "Run once:"
  echo "  cd frontend && npm install"
  exit 1
fi

backend_pid=""
frontend_pid=""

cleanup() {
  set +e
  if [ -n "${frontend_pid}" ] && kill -0 "${frontend_pid}" 2>/dev/null; then
    kill "${frontend_pid}" 2>/dev/null
  fi
  if [ -n "${backend_pid}" ] && kill -0 "${backend_pid}" 2>/dev/null; then
    kill "${backend_pid}" 2>/dev/null
  fi
  wait "${frontend_pid}" 2>/dev/null || true
  wait "${backend_pid}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:${BACKEND_PORT} ..."
(
  cd "$BACKEND_DIR"
  # shellcheck disable=SC1091
  source venv/bin/activate
  exec python3 manage.py runserver "${BACKEND_PORT}"
) &
backend_pid=$!

echo "Starting frontend on http://localhost:${FRONTEND_PORT} ..."
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host 0.0.0.0 --port "${FRONTEND_PORT}"
) &
frontend_pid=$!

echo "Both services are running."
echo "Press Ctrl+C to stop."

# Exit when either process exits, then cleanup via trap.
wait -n "$backend_pid" "$frontend_pid"
