#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v uv >/dev/null 2>&1 || {
  echo "uv가 필요합니다. https://docs.astral.sh/uv/getting-started/installation/ 를 참고하세요." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "Node.js와 npm이 필요합니다." >&2
  exit 1
}

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$ROOT"
uv run --project "$ROOT/src/backend" python -m uvicorn app.main:app --app-dir "$ROOT/src/backend" --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop both apps."
npm --prefix "$ROOT/src/frontend" run dev -- --host 127.0.0.1
