#!/usr/bin/env bash
# Start agents_api (uvicorn :8000) and web (npm run dev) together for local development.
#
# Prerequisites:
#   • Qdrant reachable at QDRANT_URL in web/.env (e.g. docker compose up -d qdrant)
#   • agents_api venv: cd agents_api && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
#   • web deps: cd web && npm install
#   • web/.env should set AGENTS_URL=http://127.0.0.1:8000 (or the port you use below)
#
# Usage:
#   ./scripts/dev-up.sh                    # loads demo/.env (AWS_*, AGENTS_STUB_LLM, …)
#   AGENTS_STUB_LLM=0 ./scripts/dev-up.sh # CLI overrides .env for that variable
#   UVICORN_PORT=8001 ./scripts/dev-up.sh   # then set AGENTS_URL to match in web/.env
#   SKIP_AGENTS=1 ./scripts/dev-up.sh       # only npm run dev (web)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$ROOT/agents_api"
WEB_DIR="$ROOT/web"
UVICORN_PORT="${UVICORN_PORT:-8000}"

# Same file docker compose reads for AWS_* / AGENTS_STUB_LLM / BEDROCK_* (uvicorn does not load .env by itself).
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

export AGENTS_STUB_LLM="${AGENTS_STUB_LLM:-1}"

UVICORN_PID=""

cleanup() {
  if [[ -n "${UVICORN_PID}" ]] && kill -0 "${UVICORN_PID}" 2>/dev/null; then
    echo ""
    echo "Stopping agents_api (pid ${UVICORN_PID})…"
    kill "${UVICORN_PID}" 2>/dev/null || true
    wait "${UVICORN_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ "${SKIP_AGENTS:-0}" != "1" ]]; then
  if [[ ! -d "$AGENTS_DIR" ]]; then
    echo "error: missing agents_api at $AGENTS_DIR" >&2
    exit 1
  fi

  cd "$AGENTS_DIR"
  if [[ -f .venv/bin/activate ]]; then
    # shellcheck source=/dev/null
    source .venv/bin/activate
  else
    echo "warning: no agents_api/.venv — using system python3 (uvicorn must be installed)" >&2
  fi

  echo "Starting agents_api on http://127.0.0.1:${UVICORN_PORT} (AGENTS_STUB_LLM=${AGENTS_STUB_LLM}, AWS_REGION=${AWS_REGION:-unset})…"
  uvicorn app.main:app --reload --host 0.0.0.0 --port "${UVICORN_PORT}" &
  UVICORN_PID=$!

  sleep 1
  if ! kill -0 "${UVICORN_PID}" 2>/dev/null; then
    echo "error: agents_api exited immediately — check agents_api logs above" >&2
    exit 1
  fi
fi

if [[ ! -d "$WEB_DIR" ]]; then
  echo "error: missing web at $WEB_DIR" >&2
  exit 1
fi

echo "Starting web (npm run dev)…"
WEB_UI_PORT="${WEB_PORT:-9780}"
echo "  UI (recommended): http://127.0.0.1:${WEB_UI_PORT}  — BFF + /api/agents proxy"
echo "  Vite only:        http://localhost:5173  — proxies /api to the BFF above"
echo "  Ensure web/.env has AGENTS_URL=http://127.0.0.1:${UVICORN_PORT}"
echo ""

cd "$WEB_DIR"
npm run dev
