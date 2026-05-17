#!/usr/bin/env bash
# Confirm n8n and agents see the same /data/regulatory volume.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HASH="${1:-aefc061c77d64b2e}"
echo "=== n8n: pdfs/${HASH}/ ==="
docker exec n8n ls -la "/data/regulatory/pdfs/${HASH}/" 2>&1 || echo "(n8n: path missing or container down)"
echo ""
echo "=== agents: pdfs/${HASH}/ ==="
docker exec regulatory-agents ls -la "/data/regulatory/pdfs/${HASH}/" 2>&1 || echo "(agents: path missing or container down)"
echo ""
echo "=== Mounts ==="
docker inspect n8n --format '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{"\n"}}{{end}}' 2>/dev/null | grep regulatory || true
docker inspect regulatory-agents --format '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{"\n"}}{{end}}' 2>/dev/null | grep regulatory || true
