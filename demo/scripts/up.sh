#!/usr/bin/env bash
# Rebuild and deploy the full regulatory demo stack (qdrant, agents, n8n, web).
#
# Default (no flags): clean stale containers, fix PDF volume perms,
# rebuild agents + web from source, deploy with existing qdrant + n8n images,
# import latest n8n workflow.
#
# Usage:
#   ./scripts/up.sh              # full rebuild + deploy (use this after code changes)
#   ./scripts/up.sh --quick      # skip image builds; restart containers + sync workflow
#   ./scripts/up.sh --no-cache   # full rebuild without Docker layer cache
#   ./scripts/up.sh --n8n-only   # restart n8n + re-import workflow only
#   ./scripts/up.sh --sync-only  # re-import workflow (n8n already running)
#   ./scripts/check-bedrock.sh   # test Titan embed (weekend auto-off aware)
#   ./scripts/up.sh --help
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

QUICK=0
NO_CACHE=0
N8N_ONLY=0
SYNC_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quick) QUICK=1; shift ;;
    --no-cache) NO_CACHE=1; shift ;;
    --n8n-only) N8N_ONLY=1; shift ;;
    --sync-only) SYNC_ONLY=1; shift ;;
    --build-all|--build) shift ;; # legacy alias; default is already full build
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 1 ;;
  esac
done

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
elif docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  echo "error: install docker-compose or docker compose" >&2
  exit 1
fi

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT")}"
ARTIFACTS_VOL="${PROJECT_NAME}_regulatory_artifacts"
WF="$ROOT/n8n_workflow.json"
SERVICES=(qdrant agents n8n web)

rm_by_name_pattern() {
  local pattern="$1"
  local ids
  ids="$(docker ps -a --filter "name=${pattern}" --format '{{.ID}}' 2>/dev/null || true)"
  if [[ -n "${ids}" ]]; then
    # shellcheck disable=SC2086
    docker rm -f ${ids} 2>/dev/null || true
  fi
}

init_artifacts_volume() {
  echo "→ PDF / layout volume permissions (${ARTIFACTS_VOL})"
  docker run --rm \
    -v "${ARTIFACTS_VOL}:/data/regulatory" \
    busybox:1.36 \
    sh -c 'set -e
mkdir -p /data/regulatory/pdfs /data/regulatory/layout /data/regulatory/diff
chown -R 1000:1000 /data/regulatory
chmod -R u+rwX,g+rwX /data/regulatory'
}

sync_n8n_workflow() {
  echo "→ Import latest n8n workflow from repo"
  if [[ ! -f "$WF" ]]; then
    echo "error: missing $WF" >&2
    exit 1
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx n8n; then
    echo "error: n8n container not running" >&2
    exit 1
  fi
  python3 "$ROOT/scripts/patch_n8n_workflow.py"
  if ! python3 -c "import json; w=json.load(open('$WF')); assert w.get('id'), 'missing workflow id'"; then
    echo "error: workflow JSON missing id after patch" >&2
    exit 1
  fi
  docker cp "$WF" n8n:/tmp/regulatory-workflow.json
  if docker exec -u node n8n n8n import:workflow --input=/tmp/regulatory-workflow.json; then
    echo "  In n8n: open \"Regulatory PDF RAG (demo)\" → Activate → run ingest"
  else
    echo ""
    echo "CLI import failed. Use the UI instead:" >&2
    echo "  n8n → ⋮ menu → Import from file → $WF" >&2
    echo "  Then delete any older duplicate workflow and Activate the imported one." >&2
    exit 1
  fi
}

clean_stale_containers() {
  echo "→ Clean stale containers (avoids docker-compose ContainerConfig errors)"
  for svc in "${SERVICES[@]}"; do
    "${COMPOSE[@]}" stop "$svc" 2>/dev/null || true
    "${COMPOSE[@]}" rm -f "$svc" 2>/dev/null || true
  done
  rm_by_name_pattern "regulatory-agents"
  rm_by_name_pattern "regulatory-web"
  rm_by_name_pattern "qdrant"
  rm_by_name_pattern "artifacts-init"
  rm_by_name_pattern "_n8n"
  for fixed in qdrant regulatory-agents regulatory-web n8n; do
    docker rm -f "$fixed" 2>/dev/null || true
  done
  # Hashed names from older compose runs
  while read -r id; do
    [[ -z "$id" ]] && continue
    docker rm -f "$id" 2>/dev/null || true
  done < <(docker ps -a --filter "name=qdrant" --filter "name=regulatory-agents" --format '{{.ID}}' 2>/dev/null || true)
}

compose_up() {
  if ! "${COMPOSE[@]}" up -d --force-recreate "${SERVICES[@]}"; then
    echo "  compose up failed — retrying after extra cleanup…" >&2
    docker rm -f qdrant regulatory-agents regulatory-web n8n 2>/dev/null || true
    rm_by_name_pattern "qdrant"
    rm_by_name_pattern "regulatory-agents"
    "${COMPOSE[@]}" up -d --force-recreate "${SERVICES[@]}"
  fi
}

verify_agents() {
  if curl -sf http://localhost:8000/openapi.json 2>/dev/null | grep -q ingest/process; then
    echo "→ agents: /v1/ingest/process OK"
  else
    echo "warning: agents missing /v1/ingest/process — run: docker-compose logs agents" >&2
  fi
  if docker ps --format '{{.Names}}' | grep -qx regulatory-agents; then
    docker exec regulatory-agents sh -c '
      if test -z "$AWS_ACCESS_KEY_ID"; then
        echo "warning: agents container has no AWS_ACCESS_KEY_ID — impact summary / alert triage will use stub text" >&2
      fi
      if test "$AGENTS_STUB_LLM" = "1" || test "$AGENTS_STUB_LLM" = "true"; then
        echo "→ agents: AGENTS_STUB_LLM=1 (Bedrock skipped for summary / triage)" >&2
      fi
    ' 2>/dev/null || true
  fi
}

check_bedrock_optional() {
  if [[ -x "$ROOT/scripts/check-bedrock.sh" ]]; then
    echo ""
    "$ROOT/scripts/check-bedrock.sh" || true
  fi
}

wait_healthy() {
  echo "→ Waiting for services…"
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -sf http://localhost:6333/healthz >/dev/null 2>&1 && break
    sleep 2
  done
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -sf http://localhost:8000/health >/dev/null 2>&1 && break
    sleep 2
  done
}

# --- Modes ---

if [[ "$SYNC_ONLY" == 1 ]]; then
  sync_n8n_workflow
  exit 0
fi

if [[ "$N8N_ONLY" == 1 ]]; then
  init_artifacts_volume
  docker rm -f n8n 2>/dev/null || true
  "${COMPOSE[@]}" rm -f n8n 2>/dev/null || true
  echo "→ Recreate n8n (existing n8nio/n8n image)"
  "${COMPOSE[@]}" up -d --no-deps --force-recreate n8n
  sync_n8n_workflow
  "${COMPOSE[@]}" ps
  exit 0
fi

echo "=== Regulatory demo: rebuild and deploy ==="
echo ""

# Always refresh workflow JSON from fragments before deploy
python3 "$ROOT/scripts/patch_n8n_workflow.py"

clean_stale_containers
init_artifacts_volume

if [[ "$QUICK" == 1 ]]; then
  echo "→ Quick mode: skip image builds"
else
  BUILD_ARGS=()
  [[ "$NO_CACHE" == 1 ]] && BUILD_ARGS=(--no-cache)
  echo "→ Rebuild agents + web from source (qdrant + n8n use existing images from compose)"
  "${COMPOSE[@]}" build "${BUILD_ARGS[@]}" agents web
fi

echo "→ Deploy qdrant, agents, n8n, web (qdrant/qdrant:latest, n8nio/n8n:latest — not rebuilt)"
compose_up
wait_healthy
verify_agents
sync_n8n_workflow

echo ""
echo "=== Done ==="
"${COMPOSE[@]}" ps
echo ""
echo "  n8n    http://localhost:5678"
echo "  web    http://localhost:8787"
echo "  qdrant http://localhost:6333"
echo "  agents http://localhost:8000"
echo ""
echo "Bedrock (ingest embeddings): ./scripts/check-bedrock.sh"
