#!/usr/bin/env python3
"""Parse /tmp/diag-response.txt and print the per-stop routing verdict."""
import json, sys
from pathlib import Path

p = Path("/tmp/diag-response.txt")
if not p.exists():
    print(f"error: {p} not found — run ./scripts/diagnose-routing-89.sh first")
    sys.exit(2)

d = json.loads(p.read_text())
stops = d.get("stops", [])
print(f'Generated "{d.get("title","")}" — {len(stops)} stops\n')
print(f'{"Day":<5} {"City":<32} {"km":>6} {"driveTimeMin":>14}  {"formatted":>10}')
print("-" * 75)
for s in stops:
    km = s.get("km", "ABSENT")
    t = s.get("driveTimeMin", "ABSENT")
    tstr = ""
    if isinstance(t, int) and t > 0:
        h, m = t // 60, t % 60
        tstr = f"{h}h{m:02d}m" if h else f"{m}m"
    print(f'{s["day"]:<5} {s["city"]:<32} {str(km):>6} {str(t):>14}  {tstr:>10}')

have = sum(1 for s in stops if "km" in s and "driveTimeMin" in s)
print(f'\nkm/driveTimeMin present on {have}/{len(stops)} stops')

print("\n=== Reality check ===")
print("Helsingborg→Göteborg: ~140 km / ~1h40m  (old broken: 247 km)")
print("Göteborg→Stockholm:   ~420 km / ~5h")
print()
nonzero = [s for s in stops if isinstance(s.get("km"), int) and s.get("km", 0) > 0]
all_reasonable = True
for s in nonzero:
    km, t = s["km"], s["driveTimeMin"]
    speed = km / (t / 60) if t > 0 else 0
    flag = "✓" if 30 <= speed <= 130 else "⚠"
    if not (30 <= speed <= 130): all_reasonable = False
    th, tm = t // 60, t % 60
    tstr = f"{th}h{tm:02d}m" if th else f"{tm}m"
    print(f"  Day {s['day']} from previous stop:  {km:>4} km,  {tstr:>6}   (implied {speed:>3.0f} km/h)  {flag}")

print()
absent = sum(1 for s in stops if "km" not in s)
if absent == 0 and all_reasonable:
    print("VERDICT: ✓ Azure Maps integration (#89) is working end-to-end.")
elif absent > 0:
    print(f"VERDICT: ⚠ {absent} stop(s) missing km/driveTimeMin.")
else:
    print("VERDICT: ⚠ implausible speeds detected.")
