# OpenRouter Migration Design

**Date:** 2026-06-03
**Status:** Approved

## Goal

Replace the direct Anthropic SDK dependency with OpenRouter so the active LLM model can be switched via an Azure App Setting without redeploying. The frontend is unaffected.

## Architecture

### Files changed

| File | Change |
|------|--------|
| `api/package.json` | Remove `@anthropic-ai/sdk`, add `openai` |
| `api/src/lib/anthropicClient.ts` → `llmClient.ts` | OpenAI SDK client pointed at `https://openrouter.ai/api/v1` |
| `api/src/lib/anthropicClient.test.ts` → `llmClient.test.ts` | Updated mock for new client shape |
| `api/src/lib/itinerarySchema.ts` | Convert Anthropic `input_schema` wrapper → OpenAI `parameters` wrapper |
| `api/src/functions/generate.ts` | Parse `choices[0].message.tool_calls`; check `finish_reason === 'length'` |
| `api/src/functions/generate.test.ts` | Mock updated to OpenAI response shape |
| `docs/api.md` | Add "LLM Provider" section documenting env vars and model switching |

### No changes

- `frontend/` — untouched
- `api/src/types.ts` — `Itinerary` and `ItineraryStop` types unchanged
- `validateItinerary()` — logic unchanged
- All other API functions — unchanged

## Configuration

Two new Azure App Settings replace `ANTHROPIC_API_KEY`:

| Setting | Required | Default | Purpose |
|---------|----------|---------|---------|
| `OPENROUTER_API_KEY` | yes | — | Auth token for OpenRouter |
| `LLM_MODEL` | no | `anthropic/claude-sonnet-4-6` | Model string passed to OpenRouter |

Switching models (e.g. to GPT-4o) is a portal config change: set `LLM_MODEL=openai/gpt-4o`, restart the Function App. No code change or redeploy needed.

`ANTHROPIC_API_KEY` should be removed from Azure App Settings once the migration is verified.

## Data Flow

```
GeneratorPanel → POST /api/generate
  → getLlmClient()          returns OpenAI instance (baseURL: openrouter.ai)
  → chat.completions.create({ model: LLM_MODEL, tools: [ITINERARY_FUNCTION], tool_choice: ... })
  → choices[0].message.tool_calls[0].function.arguments  (JSON string)
  → JSON.parse(arguments)
  → validateItinerary(input)
  → return Itinerary
```

## Schema Conversion

The itinerary JSON schema properties are identical. Only the wrapper format changes:

```typescript
// Before (Anthropic)
{
  name: 'create_itinerary',
  description: '...',
  input_schema: { type: 'object', properties: {...}, required: [...] }
}

// After (OpenAI / OpenRouter)
{
  type: 'function',
  function: {
    name: 'create_itinerary',
    description: '...',
    parameters: { type: 'object', properties: {...}, required: [...] }
  }
}
```

Tool choice:
```typescript
// Before: { type: 'tool', name: 'create_itinerary' }
// After:  { type: 'function', function: { name: 'create_itinerary' } }
```

## Response Parsing

```typescript
// Before (Anthropic)
if (response.stop_reason === 'max_tokens') { ... }
const toolBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'create_itinerary')
const input = toolBlock.input

// After (OpenAI)
const choice = response.choices[0]
if (choice.finish_reason === 'length') { ... }
const toolCall = choice.message.tool_calls?.[0]
const input = JSON.parse(toolCall.function.arguments)
```

## Error Handling

Same error responses as today:
- `finish_reason === 'length'` → 502 "Itinerary too long to generate — try fewer days"
- No tool call in response → 502 "Claude did not return a structured itinerary"
- `validateItinerary` fails → 502 "Claude returned an invalid itinerary structure"
- Anthropic/network error → 500 "Generation failed: {message}"

## Testing

Mock `openai` module's `chat.completions.create`. Return OpenAI-shaped responses:
```typescript
{
  choices: [{
    finish_reason: 'tool_calls',
    message: {
      tool_calls: [{
        function: { name: 'create_itinerary', arguments: JSON.stringify(itinerary) }
      }]
    }
  }]
}
```

All four existing test cases remain: success, invalid body, no tool call, API error.

## OpenRouter Client Setup

```typescript
import OpenAI from 'openai'

export function getLlmClient(): OpenAI {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured')
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    defaultHeaders: {
      'HTTP-Referer': 'https://zealous-forest-053645a03.7.azurestaticapps.net',
      'X-Title': 'SwedenTravel',
    },
  })
}
```

The client is not cached as a singleton (unlike the old Anthropic client) because the model string is read per-request from `process.env.LLM_MODEL`, making it safe for hot config changes.
