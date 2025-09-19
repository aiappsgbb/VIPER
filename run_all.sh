#!/usr/bin/env bash
# Script to build the COBRA UI Docker image and start the FastAPI backend.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_DIR="$ROOT_DIR/src/ui"
IMAGE_NAME="${UI_IMAGE_NAME:-cobra-ui}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker command not found. Please install Docker before running this script." >&2
  exit 1
fi

if [ ! -d "$UI_DIR" ]; then
  echo "Error: UI directory '$UI_DIR' not found." >&2
  exit 1
fi

echo "Building UI Docker image '$IMAGE_NAME' from $UI_DIR..."
docker build -t "$IMAGE_NAME" "$UI_DIR"

echo "Starting backend API server on $BACKEND_HOST:$BACKEND_PORT..."
if command -v poetry >/dev/null 2>&1; then
  exec poetry run uvicorn cobrapy.api.app:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
elif command -v uvicorn >/dev/null 2>&1; then
  exec uvicorn cobrapy.api.app:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
else
  echo "Error: neither 'poetry' nor 'uvicorn' is available to run the backend server." >&2
  echo "Install Poetry or Uvicorn to continue." >&2
  exit 1
fi
