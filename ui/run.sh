#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Install it first: https://astral.sh/uv"
  exit 1
fi

if [[ ! -d ".venv" ]]; then
  uv venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

uv pip install -r requirements.txt

if [[ ! -f ".env" ]]; then
  echo "Missing ui/.env. Create it from ui/.env.example:"
  echo "  cp .env.example .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

exec streamlit run app.py
