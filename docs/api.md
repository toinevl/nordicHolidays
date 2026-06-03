# API Reference

## Base URL

```
https://sweden-travel-api.azurewebsites.net
```

All endpoints are prefixed with `/api`. Requests and responses use `application/json`. CORS is open to the SWA origin.

---

## LLM Provider

The generate endpoint uses [OpenRouter](https://openrouter.ai) as a model-routing layer, configured via two Azure App Settings:

| Setting | Required | Default | Description |
|---------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | yes | — | API key from openrouter.ai |
| `LLM_MODEL` | no | `anthropic/claude-sonnet-4-6` | Model string passed to OpenRouter |

### Switching models

To swap the active model without redeploying:

1. Go to **Azure Portal → Function App `sweden-travel-api` → Configuration → Application settings**
2. Set `LLM_MODEL` to any [OpenRouter model string](https://openrouter.ai/models), e.g.:
   - `openai/gpt-4o`
   - `meta-llama/llama-3.1-70b-instruct`
   - `anthropic/claude-opus-4-8`
3. Click **Save** and restart the Function App.

### Local development

Add to `api/.env` (create if it doesn't exist):

```
OPENROUTER_API_KEY=sk-or-...
LLM_MODEL=anthropic/claude-sonnet-4-6
```

---

## GET /api/health

Returns service status. No authentication required.

**Response 200**
```json
{ "status": "ok", "timestamp": "2026-06-03T10:00:00.000Z" }
```

---

## GET /api/preferences

Returns the stored travel preferences for the owner.

**Response 200**
```json
{
  "travelStyle": "mixed",
  "interests": ["hiking", "castles", "seafood"],
  "avoidHighways": false,
  "pace": "relaxed"
}
```

**Response 404** — no preferences saved yet; use defaults.

---

## PUT /api/preferences

Saves (upserts) travel preferences.

**Request body**
```json
{
  "travelStyle": "outdoors",
  "interests": ["hiking", "wildlife", "photography"],
  "avoidHighways": true,
  "pace": "relaxed"
}
```

**Response 204** — no body.

---

## POST /api/generate

Generates an AI-powered itinerary using Claude (forced tool use for structured output).

**Request body**
```json
{
  "region": "Norrland",
  "duration": 7,
  "startCity": "Umeå",
  "preferences": {
    "interests": ["hiking", "wildlife"],
    "pace": "relaxed"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `region` | string | yes | Swedish region or "full country" |
| `duration` | number | yes | Trip length in days (1–30) |
| `startCity` | string | no | Departure city (default: Stockholm) |
| `preferences` | object | no | Overrides stored preferences for this request |

**Response 200**
```json
{
  "title": "7-day Norrland Wilderness",
  "region": "Norrland",
  "totalDays": 7,
  "startCity": "Umeå",
  "endCity": "Luleå",
  "totalDriveKm": 620,
  "season": "summer",
  "weatherNote": "Midnight sun; temperatures 15–22 °C. Pack layers for evenings.",
  "days": [
    {
      "day": 1,
      "title": "Umeå → Höga Kusten",
      "driveKm": 130,
      "stops": [
        {
          "id": "stop-01",
          "name": "Skuleskogen National Park",
          "lat": 63.0,
          "lon": 18.35,
          "type": "nature",
          "region": "Höga Kusten",
          "regionColour": "#2d7d46",
          "description": "Hike through ancient boreal forest to panoramic sea views.",
          "duration": "3–4 h",
          "tips": "Start early to catch the morning mist over the archipelago."
        }
      ]
    }
  ]
}
```

**Response 400** — invalid request body.
**Response 502** — Anthropic API error.

---

## GET /api/city-search

Returns optional remote city suggestions for the Start city and Finish city lookup fields. The frontend always searches its built-in curated city list first; this endpoint is a fallback for uncommon places.

**Query parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `q` | string | yes | City search text; fewer than 2 characters returns an empty list |

**Response 200**
```json
[
  {
    "id": "amsterdam-nl",
    "name": "Amsterdam",
    "countryCode": "NL",
    "countryName": "Netherlands",
    "region": "North Holland",
    "lat": 52.3676,
    "lng": 4.9041,
    "aliases": ["AMS"]
  }
]
```

If `CITY_SEARCH_ENDPOINT` is not configured, the endpoint returns `[]`. Public Nominatim autocomplete is intentionally not used.

---

## GET /api/itineraries

Returns a summary list of all saved itineraries.

**Response 200**
```json
[
  {
    "id": "a1b2c3d4",
    "name": "Summer in Norrland",
    "region": "Norrland",
    "totalDays": 7,
    "createdAt": "2026-06-01T14:22:00.000Z"
  },
  {
    "id": "e5f6g7h8",
    "name": "Stockholm to Gothenburg",
    "region": "Svealand",
    "totalDays": 5,
    "createdAt": "2026-05-20T09:10:00.000Z"
  }
]
```

---

## POST /api/itineraries

Saves a new itinerary and returns its assigned ID.

**Request body**
```json
{
  "name": "Summer in Norrland",
  "itinerary": { ... }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Display name shown in SavedTripsPanel |
| `itinerary` | object | yes | Full itinerary object from POST /api/generate |

**Response 201**
```json
{ "id": "a1b2c3d4" }
```

**Response 400** — missing name or itinerary.

---

## GET /api/itineraries/:id

Returns the full itinerary for the given ID.

**Path parameter:** `id` — the rowKey returned by POST /api/itineraries.

**Response 200** — full itinerary object (same shape as POST /api/generate response).

**Response 404**
```json
{ "error": "Itinerary not found" }
```

---

## DELETE /api/itineraries/:id

Deletes a saved itinerary.

**Response 204** — no body.

**Response 404**
```json
{ "error": "Itinerary not found" }
```
