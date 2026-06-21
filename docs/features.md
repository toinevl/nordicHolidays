# Features

## Interactive Map

The map is powered by **MapLibre GL** and renders automatically whenever an itinerary is loaded.

- All stops are plotted as colour-coded markers grouped by region.
- Clicking a marker highlights the corresponding day/stop in the timeline (and vice-versa).
- The route between stops is drawn as an **animated polyline** that traces the driving path in sequence when an itinerary first loads.
- The map view auto-fits to the bounding box of all stops.

---

## Generate Itinerary (AI)

The **GeneratorPanel** (right-hand side) drives AI-powered trip creation.

1. Choose a Nordic region (or "Full country") and trip duration.
2. Optionally set a start city and adjust interests/pace.
3. Click **Generate** — the frontend calls `POST /api/generate`.
4. The API calls Azure AI Foundry (gpt-4o by default) with **forced tool use**, guaranteeing a structured `Itinerary` JSON response every time (no free-form text to parse).
5. The itinerary appears immediately in the map and timeline. A **"Unsaved"** badge appears in the StatusBar until the trip is saved.

Generation typically takes 5–15 seconds depending on trip length.

---

## Save & Load Trips

- Click **Save** to store the current itinerary in Azure Table Storage. A display name is required.
- All saved trips appear in the **SavedTripsPanel** (left-hand side) as a scrollable list.
- Click any saved trip to load it instantly — the map and timeline update without a page reload.
- Delete a trip from the panel with the trash icon; the action is confirmed before deletion.

---

## Share a Trip

Every saved trip has a shareable URL in the form:

```
https://nordicholidays.azurestaticapps.net/?id=<tripId>
```

Opening the link loads the full itinerary directly. The URL is updated automatically after saving and can be copied from the browser address bar.

---

## Print / PDF Export

Use the browser's native **Print** dialog (`Ctrl+P` / `Cmd+P`). The app ships a print stylesheet that:

- Hides the GeneratorPanel, SavedTripsPanel, and StatusBar.
- Expands the ItineraryView to full width.
- Removes interactive controls, producing a clean day-by-day printout suitable for PDF export.

---

## Day-by-Day Timeline

The **ItineraryView** presents each day as a card containing:

- Day number and title.
- Drive distance for the day (in km).
- Each stop with name, type badge, region colour tag, description, recommended duration, and local tips.
- Season/weather callout (see below).

Clicking a stop card pans the map to that stop and highlights its marker.

---

## Season / Weather Callouts

Each generated itinerary includes a `season` field and a `weatherNote`. These are surfaced as a banner at the top of the ItineraryView to help travellers pack and plan activities appropriately.

---

## Region Colour Tags

Each stop belongs to a region. Regions are assigned a consistent colour (`regionColour` hex) used in:

- Map marker fill colour.
- Timeline stop card left-border accent.
- The `currentFilter` in AppState — clicking a region badge in the timeline filters the stop list to that region only.

---

## Drive Distance Estimates

Every itinerary includes:

- **Per-day drive km** shown in the day card header.
- **Total trip drive km** shown in the itinerary summary banner.

Distances are estimated by the LLM during generation based on realistic routing and are approximate (±10%).

---

## Regenerate

The **Regenerate** button (visible once an itinerary is displayed) sends the same parameters back to `POST /api/generate` to produce a fresh itinerary. Useful when the first result doesn't match expectations. The previous unsaved itinerary is discarded; any already-saved trips in the panel are unaffected.
