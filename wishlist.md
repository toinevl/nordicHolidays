---
labels:
  bug: { color: red }
  feature: { color: "#2563eb" }
  ui: { color: "#16a34a" }
  improvement: { color: "#f59e0b" }
statuses:
  - { char: ~, label: "in-progress", color: "#f59e0b" }
  - { char: r, label: "in-review", color: "#8b5cf6" }
  - { char: x, label: done, color: "#22c55e" }
  - { char: c, label: cancelled, color: "#6b7280" }
---

# Wishlist

## Backlog

- [x] (A) Add MapLibre 3D `/map` route and integrated view +feature @me #1
- [x] (A) Harden anonymous owner persistence flow +storage +feature @me #2
- [x] (B) Externalize UI strings to NL/EN locale files +i18n +feature @me #3
- [ ] (B) Add GitHub Actions CI status badge to frontend +ci +feature @me #4
- [x] (C) Add integration tests for anonymous save/load flow +testing +feature @me #5
- [ ] (C) Profile API hardening and request validation +api +improvement @me #6
- [x] (C) Default the trip-save name to the current trip name +api +improvement @me #7
- [x] (B) Country-aware lookup fields for start/end city +feature +improvement @me #8
- [x] (A) Saving a generated itinerary gives no success/failure feedback +bug +ui @me #9
- [x] (A) Can the country of travel be limited to the one selected so travels do not cross boarders +bug +ui @me #10
- [ ] (A) Validate whether itineraries are actually saved in Azure Table Storage +bug +testing @me #11
- [ ] (B) Remove delete option from saved itineraries UI — deletion is a management task, not user-facing +feature +ui @me #12
- [x] (A) Save button has perceptible delay with no loading state — user doubts it worked, navigates away or double-clicks +bug +ui @me #13
- [r] (B) Loading saved itineraries takes 10+ seconds — investigate performance bottleneck and optimize +bug +perf @me #14
