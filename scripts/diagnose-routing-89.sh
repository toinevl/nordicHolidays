#!/usr/bin/env bash
#
# Diagnostic version of test-routing-89.sh — prints HTTP status, headers,
# and body separately so we can see exactly what the Functions host returns.
#
# Usage: ./scripts/diagnose-routing-89.sh

set -euo pipefail

API_HOST="${API_HOST:-https://nordic-holidays-api.azurewebsites.net}"

# UUID fallback
gen_uuid() {
  if command -v uuidgen >/dev/null 2>&1; then uuidgen
  elif command -v uuid >/dev/null 2>&1; then uuid
  elif [ -r /proc/sys/kernel/random/uuid ]; then cat /proc/sys/kernel/random/uuid
  else python3 -c 'import uuid; print(uuid.uuid4())'; fi
}

OWNER_ID="owner-$(gen_uuid | tr '[:upper:]' '[:lower:]')"

echo "=== Endpoint: $API_HOST/api/generate ==="
echo "=== X-Owner-Id: $OWNER_ID ==="
echo ""

# Step 1: health check (no body, fast)
echo "--- Step 1: /api/health ---"
curl -sS -o /dev/null -w "HTTP %{http_code}  (%{time_total}s)\n" \
  --max-time 15 "$API_HOST/api/health" || echo "health check failed"
echo ""

# Step 2: the generate call, with verbose status info
echo "--- Step 2: POST /api/generate ---"
BODY='{"country":"SE","tripDays":4,"startCity":"Helsingborg","endCity":"Stockholm","mustVisit":["Göteborg"],"avoid":[],"lang":"en"}'

# Capture status + body separately
HTTP_CODE=$(curl -sS -o /tmp/diag-response.txt -w "%{http_code}" \
  -X POST "$API_HOST/api/generate" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://fjordvia.com' \
  -H "X-Owner-Id: $OWNER_ID" \
  -d "$BODY" \
  --max-time 180)

echo "HTTP status: $HTTP_CODE"
echo "Response size: $(wc -c < /tmp/diag-response.txt) bytes"
echo ""
echo "--- First 1000 chars of response body ---"
head -c 1000 /tmp/diag-response.txt
echo ""
echo "--- end ---"
