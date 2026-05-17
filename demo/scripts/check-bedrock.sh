#!/usr/bin/env bash
# Check Bedrock reachability + embed model (weekend auto-off aware).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

REGION="${AWS_REGION:-us-east-1}"
EMBED_MODEL="${BEDROCK_EMBED_MODEL_ID:-amazon.titan-embed-text-v2:0}"
DOW=$(date +%u) # 1=Mon … 6=Sat 7=Sun

echo "=== Bedrock check ==="
echo "Region:      ${REGION}"
echo "Embed model: ${EMBED_MODEL}"
echo "Local time:  $(date '+%A %Y-%m-%d %H:%M %Z')"
echo ""

if [[ "$DOW" == "6" || "$DOW" == "7" ]]; then
  echo "⚠ Weekend (Sat/Sun): Bedrock may be auto-OFF in your account."
  echo "  Ingest embedding will fail until it is turned back on (often Monday)."
  echo ""
fi

echo "=== Credentials (names only) ==="
[[ -n "${AWS_ACCESS_KEY_ID:-}" || -n "${N8N_AWS_ACCESS_KEY_ID:-}" ]] && echo "  Host .env: AWS key present" || echo "  Host .env: AWS key MISSING"
if docker ps --format '{{.Names}}' | grep -qx n8n; then
  docker exec n8n sh -c 'test -n "$AWS_ACCESS_KEY_ID" && echo "  n8n container: AWS_ACCESS_KEY_ID=set" || echo "  n8n container: AWS_ACCESS_KEY_ID=missing"'
  docker exec n8n sh -c '
    prefix=$(echo -n "$AWS_ACCESS_KEY_ID" | cut -c1-4)
    echo "  n8n container: access key prefix=${prefix}…"
    if test -n "$AWS_SESSION_TOKEN"; then
      if echo "$AWS_ACCESS_KEY_ID" | grep -q "^AKIA"; then
        echo "  n8n container: ⚠ AWS_SESSION_TOKEN is SET but key is AKIA — this breaks Bedrock SigV4."
        echo "    Fix: unset AWS_SESSION_TOKEN in your shell, recreate n8n: ./scripts/up.sh --n8n-only"
      else
        echo "  n8n container: AWS_SESSION_TOKEN=set (expected for ASIA temp keys)"
      fi
    else
      echo "  n8n container: AWS_SESSION_TOKEN=unset"
    fi
  '
else
  echo "  n8n container: not running"
fi
if docker ps --format '{{.Names}}' | grep -qx regulatory-agents; then
  docker exec regulatory-agents sh -c 'test -n "$AWS_ACCESS_KEY_ID" && echo "  agents container: AWS_ACCESS_KEY_ID=set" || echo "  agents container: AWS_ACCESS_KEY_ID=missing"'
  docker exec regulatory-agents sh -c '
    prefix=$(echo -n "$AWS_ACCESS_KEY_ID" | cut -c1-4)
    echo "  agents container: access key prefix=${prefix}…"
    echo "  agents container: AGENTS_STUB_LLM=${AGENTS_STUB_LLM:-unset}"
    if test -n "$AWS_SESSION_TOKEN"; then
      if echo "$AWS_ACCESS_KEY_ID" | grep -q "^AKIA"; then
        echo "  agents container: ⚠ AWS_SESSION_TOKEN is SET but key is AKIA — remove from .env / shell."
      else
        echo "  agents container: AWS_SESSION_TOKEN=set (expected for ASIA temp keys)"
      fi
    else
      echo "  agents container: AWS_SESSION_TOKEN=unset"
    fi
  '
else
  echo "  agents container: not running"
fi
echo ""

echo "=== Live embed test (same model as ingest workflow) ==="
RUNNER=""
if docker ps --format '{{.Names}}' | grep -qx regulatory-agents; then
  RUNNER="docker exec -e AWS_REGION -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN regulatory-agents"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import boto3" 2>/dev/null; then
  RUNNER="env"
else
  echo "  Skip: start agents container (./scripts/up.sh) or install boto3 on host."
  exit 1
fi

export AWS_REGION="$REGION"
PY='
import json, os, sys
from datetime import datetime

region = os.environ.get("AWS_REGION", "us-east-1")
model = os.environ.get("EMBED_MODEL", "amazon.titan-embed-text-v2:0")
try:
    import boto3
    from botocore.exceptions import ClientError, EndpointConnectionError
except ImportError:
    print("  FAIL: boto3 not installed")
    sys.exit(1)

if not os.environ.get("AWS_ACCESS_KEY_ID"):
    print("  FAIL: AWS_ACCESS_KEY_ID not set in environment")
    sys.exit(1)

client = boto3.client("bedrock-runtime", region_name=region)
body = json.dumps({"inputText": "bedrock connectivity test", "dimensions": 1024, "normalize": True})
try:
    r = client.invoke_model(modelId=model, body=body, contentType="application/json", accept="application/json")
    out = json.loads(r["body"].read())
    dim = len(out.get("embedding") or [])
    print(f"  OK: Bedrock responded — embedding length {dim}")
    sys.exit(0)
except EndpointConnectionError as e:
    print(f"  FAIL: network/DNS — {e}")
    sys.exit(2)
except ClientError as e:
    code = e.response.get("Error", {}).get("Code", "")
    msg = e.response.get("Error", {}).get("Message", str(e))
    print(f"  FAIL: AWS {code}: {msg}")
    if code in ("AccessDeniedException", "ValidationException", "ResourceNotFoundException"):
        print("  Hint: model access in Bedrock console, or weekend auto-off policy.")
    sys.exit(3)
except Exception as e:
    print(f"  FAIL: {type(e).__name__}: {e}")
    sys.exit(4)
'

export EMBED_MODEL="$EMBED_MODEL"
if [[ "$RUNNER" == "env" ]]; then
  python3 -c "$PY"
  RC=$?
else
  $RUNNER python -c "$PY"
  RC=$?
fi

echo ""
case $RC in
  0) echo "Bedrock is usable for ingest." ;;
  2) echo "Network problem reaching Bedrock (VPN, firewall, or service off)." ;;
  3) echo "AWS rejected the call — likely weekend off, missing model access, or bad credentials." ;;
  *) echo "Bedrock check failed (exit $RC)." ;;
esac
exit "$RC"
