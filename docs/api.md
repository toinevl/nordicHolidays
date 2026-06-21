# API Reference

## Base URL

```
https://nordic-holidays-api.azurewebsites.net
```

All endpoints are prefixed with `/api`. Requests and responses use `application/json`. CORS is open to the SWA origin.

---

## LLM Provider

The generate endpoint uses **Azure AI Foundry** (via OpenAI SDK) to access GPT models, configured via three Azure App Settings:

| Setting | Required | Default | Description |
|---------|----------|---------|-------------|
| `AZURE_FOUNDRY_API_KEY` | yes | — | API key from Azure AI Foundry (stored in Key Vault secret `AZURE-FOUNDRY-API-KEY`) |
| `AZURE_FOUNDRY_ENDPOINT` | yes | — | Azure AI Foundry endpoint URL |
| `LLM_MODEL` | no | `gpt-4o` | Model name deployed in Azure AI Foundry |

### Switching models

To swap the active model without redeploying:

1. Go to **Azure Portal → Function App `nordic-holidays-api` → Configuration → Application settings**
2. Set `LLM_MODEL` to any model deployed in your Azure AI Foundry project, e.g.:
   - `gpt-4o` (default)
   - `gpt-4-turbo`
   - `gpt-35-turbo`
3. Click **Save** and restart the Function App.

### Local development

Add to `api/local.settings.json`:

```json
{
  "AZURE_FOUNDRY_API_KEY": "your-api-key-here",
  "AZURE_FOUNDRY_ENDPOINT": "https://<your-region>.api.cognitive.microsoft.com/openai",
  "LLM_MODEL": "gpt-4o"
}
```

Or set environment variables before running `npm start`:

```bash
export AZURE_FOUNDRY_API_KEY="your-api-key-here"
export AZURE_FOUNDRY_ENDPOINT="https://<your-region>.api.cognitive.microsoft.com/openai"
export LLM_MODEL="gpt-4o"
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

Generates an AI-powered itinerary using Azure AI Foundry (forced tool use for structured output).

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
**Response 429** — rate limit exceeded (5/hour per owner, 20/hour per IP).
**Response 502** — Azure AI Foundry API error.

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
