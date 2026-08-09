#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v uv >/dev/null 2>&1 || {
  echo "uv가 필요합니다." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "Node.js와 npm이 필요합니다." >&2
  exit 1
}

echo "Running frontend tests..."
npm --prefix "$ROOT/src/frontend" test -- --run

echo "Running backend tests..."
uv run --project "$ROOT/src/backend" --extra dev pytest

echo "Running MCP tests..."
uv run --project "$ROOT/src/mcp" --extra dev pytest

echo "Running E2E tests..."
npm --prefix "$ROOT/src/e2e" test

echo "All tests passed."
