#!/usr/bin/env bash
#
# test-routing-89.sh — Live end-to-end verification of wishlist #89
#                       (real driving distances via Azure Maps).
#
# Generates a 4-day SE itinerary that goes Helsingborg → Göteborg → Stockholm,
# then prints the km / driveTimeMin the API attached to each stop.
#
# The Helsingborg → Göteborg leg is the pair that originally exposed the
# straight-line × 1.3 multiplier bug: real driving is ~140 km / ~1h40m,
# the old broken code reported 247 km.
#
# Requirements:
#   - curl, python3, uuidgen (or uuid on macOS)
#   - Network access to the live Functions host
#
# Usage:
#   ./scripts/test-routing-89.sh
#   API_HOST=https://other-env.azurewebsites.net ./scripts/test-routing-89.sh
#
# Exit codes:
#   0 — all stops enriched with real km/driveTimeMin, plausible driving speeds
#   1 — API error, missing fields, or implausible values (investigate via App Insights)

set -euo pipefail

API_HOST="${API_HOST:-https://nordic-holidays-api.azurewebsites.net}"
ORIGIN="${ORIGIN:-https://fjordvia.com}"

# uuidgen on Linux, uuid on macOS — fall back to /proc/sys/kernel/random/uuid
gen_uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen
  elif command -v uuid >/dev/null 2>&1; then
    uuid
  elif [ -r /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid
  else
    python3 -c 'import uuid; print(uuid.uuid4())'
  fi
}

OWNER_ID="owner-$(gen_uuid | tr '[:upper:]' '[:lower:]')"

echo "Triggering one /api/generate against: $API_HOST"
echo "Guest identity (X-Owner-Id):          $OWNER_ID"
echo "Route under test:                     Helsingborg → Göteborg → Stockholm"
echo "Reference (Google Maps real driving):  Helsingborg→Göteborg ~140 km / ~1h40m"
echo "                                      (old broken code reported 247 km here)"
echo "                                      Göteborg→Stockholm   ~420 km / ~5h"
echo ""
echo "Generating (LLM call, can take 30-90s)..."

RESPONSE=$(curl -sS -X POST "$API_HOST/api/generate" \
  -H 'Content-Type: application/json' \
  -H "Origin: $ORIGIN" \
  -H "X-Owner-Id: $OWNER_ID" \
  -d '{"country":"SE","tripDays":4,"startCity":"Helsingborg","endCity":"Stockholm","mustVisit":["Göteborg"],"avoid":[],"lang":"en"}' \
  --max-time 180)

echo ""
echo "── Response ────────────────────────────────────────────────────────────────"
echo "$RESPONSE" | python3 <<'PYEOF'
import json
import sys

raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception as e:
    print(f"Failed to parse JSON. First 500 chars:\n{raw[:500]}")
    sys.exit(1)

if isinstance(d, dict) and 'error' in d:
    print(f"API error: {d}")
    sys.exit(1)

stops = d.get('stops', [])
print(f'Generated "{d.get("title","")}" — {len(stops)} stops\n')
print(f'{"Day":<5} {"City":<28} {"km":>6} {"driveTimeMin":>14}  {"formatted":>10}')
print('-' * 70)
for s in stops:
    km = s.get('km', 'ABSENT')
    t = s.get('driveTimeMin', 'ABSENT')
    tstr = ''
    if isinstance(t, int) and t > 0:
        h, m = t // 60, t % 60
        tstr = f'{h}h{m:02d}m' if h else f'{m}m'
    print(f'{s["day"]:<5} {s["city"]:<28} {str(km):>6} {str(t):>14}  {tstr:>10}')

have = sum(1 for s in stops if 'km' in s and 'driveTimeMin' in s)
print(f'\nkm/driveTimeMin present on {have}/{len(stops)} stops')

print('\n── Reality check ────────────────────────────────────────────────────────────')
nonzero = [s for s in stops if isinstance(s.get('km'), int) and s.get('km', 0) > 0]
all_reasonable = True
for s in nonzero:
    km, t = s['km'], s['driveTimeMin']
    if t <= 0:
        continue
    speed = km / (t / 60)
    flag = '✓' if 30 <= speed <= 130 else '⚠'
    if not (30 <= speed <= 130):
        all_reasonable = False
    th, tm = t // 60, t % 60
    tstr = f'{th}h{tm:02d}m' if th else f'{tm}m'
    print(f'  Day {s["day"]} from previous stop:  {km:>4} km,  {tstr:>6}   (implied {speed:>3.0f} km/h)  {flag}')

print()
absent = sum(1 for s in stops if 'km' not in s)
if absent == 0 and all_reasonable:
    print('VERDICT: ✓ All stops enriched with real km/driveTimeMin, plausible speeds.')
    print('         Azure Maps integration (#89) is working end-to-end.')
    sys.exit(0)
else:
    if absent > 0:
        print(f'VERDICT: ⚠ {absent} stop(s) missing km/driveTimeMin.')
    if not all_reasonable:
        print('VERDICT: ⚠ At least one segment has an implausible driving speed.')
    print('         Check Application Insights for routing warnings:')
    print('         traces | where message has "routing:" | order by timestamp desc')
    sys.exit(1)
PYEOF
