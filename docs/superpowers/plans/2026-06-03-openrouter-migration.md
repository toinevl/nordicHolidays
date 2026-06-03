# OpenRouter Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@anthropic-ai/sdk` with the `openai` SDK pointed at OpenRouter, making the active model configurable via the `LLM_MODEL` Azure App Setting.

**Architecture:** A new `llmClient.ts` wraps the OpenAI SDK with OpenRouter's base URL and reads `OPENROUTER_API_KEY` + `LLM_MODEL` from env. `itinerarySchema.ts` converts from Anthropic tool format to OpenAI function format. `generate.ts` is updated to parse `choices[0].message.tool_calls` instead of `response.content`. The frontend is untouched.

**Tech Stack:** `openai` npm package (OpenAI-compatible SDK), OpenRouter API (`https://openrouter.ai/api/v1`), vitest for tests, TypeScript 5.5, Azure Functions v4.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `api/package.json` | Remove `@anthropic-ai/sdk`, add `openai` |
| Create | `api/src/lib/llmClient.ts` | OpenAI client factory + `getModel()` helper |
| Create | `api/src/lib/llmClient.test.ts` | Tests for client creation and model selection |
| Delete | `api/src/lib/anthropicClient.ts` | Replaced by `llmClient.ts` |
| Delete | `api/src/lib/anthropicClient.test.ts` | Replaced by `llmClient.test.ts` |
| Modify | `api/src/lib/itinerarySchema.ts` | Convert Anthropic tool → OpenAI function format |
| Modify | `api/src/functions/generate.ts` | Parse OpenAI response shape, use `getLlmClient`/`getModel` |
| Modify | `api/src/functions/generate.test.ts` | Mock updated to OpenAI response shape |
| Modify | `docs/api.md` | Add "LLM Provider" section |

---

## Task 1: Swap Dependencies

**Files:**
- Modify: `api/package.json`

- [ ] **Step 1: Remove Anthropic SDK, add OpenAI SDK**

In `api/package.json`, replace `"@anthropic-ai/sdk": "^0.54.0"` with `"openai": "^4.77.0"` in `dependencies`.

Full `dependencies` block after change:
```json
"dependencies": {
  "openai": "^4.77.0",
  "@azure/data-tables": "^13.3.0",
  "@azure/functions": "^4.5.0",
  "nanoid": "^5.0.0"
}
```

- [ ] **Step 2: Install**

```bash
cd api && npm install
```

Expected: no errors, `node_modules/openai` exists, `@anthropic-ai/sdk` is gone from `node_modules`.

- [ ] **Step 3: Verify build still compiles (will have errors — that's fine)**

```bash
cd api && npm run build 2>&1 | head -20
```

Expected: TypeScript errors about missing `@anthropic-ai/sdk` imports — these will be fixed in Tasks 2–4.

---

## Task 2: Create `llmClient.ts` (TDD)

**Files:**
- Create: `api/src/lib/llmClient.ts`
- Create: `api/src/lib/llmClient.test.ts`
- Delete: `api/src/lib/anthropicClient.ts`
- Delete: `api/src/lib/anthropicClient.test.ts`

- [ ] **Step 1: Write failing tests**

Create `api/src/lib/llmClient.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'

describe('getLlmClient', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
  })

  it('throws if OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY
    const { getLlmClient } = await import('./llmClient')
    expect(() => getLlmClient()).toThrow('OPENROUTER_API_KEY is not configured')
  })

  it('returns an object with chat.completions.create when key is set', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const { getLlmClient } = await import('./llmClient')
    const client = getLlmClient()
    expect(client.chat.completions.create).toBeDefined()
  })
})

describe('getModel', () => {
  afterEach(() => {
    delete process.env.LLM_MODEL
  })

  it('defaults to anthropic/claude-sonnet-4-6', async () => {
    delete process.env.LLM_MODEL
    const { getModel } = await import('./llmClient')
    expect(getModel()).toBe('anthropic/claude-sonnet-4-6')
  })

  it('returns LLM_MODEL env var when set', async () => {
    process.env.LLM_MODEL = 'openai/gpt-4o'
    const { getModel } = await import('./llmClient')
    expect(getModel()).toBe('openai/gpt-4o')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd api && npx vitest run src/lib/llmClient.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './llmClient'`

- [ ] **Step 3: Create `llmClient.ts`**

Create `api/src/lib/llmClient.ts`:

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

export function getModel(): string {
  return process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-6'
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd api && npx vitest run src/lib/llmClient.test.ts 2>&1 | tail -10
```

Expected: 4 tests PASS.

- [ ] **Step 5: Delete old Anthropic client files**

```bash
rm api/src/lib/anthropicClient.ts api/src/lib/anthropicClient.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add api/package.json api/package-lock.json api/src/lib/llmClient.ts api/src/lib/llmClient.test.ts
git rm api/src/lib/anthropicClient.ts api/src/lib/anthropicClient.test.ts
git commit -m "feat(api): replace Anthropic SDK with OpenAI SDK via OpenRouter"
```

---

## Task 3: Convert `itinerarySchema.ts`

**Files:**
- Modify: `api/src/lib/itinerarySchema.ts`

This file is pure configuration — no behaviour to test. The JSON schema properties themselves are identical to before; only the wrapper format changes.

- [ ] **Step 1: Replace the file contents**

Full new `api/src/lib/itinerarySchema.ts`:

```typescript
import type OpenAI from 'openai'

export const ITINERARY_FUNCTION: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_itinerary',
    description: 'Create a structured road trip itinerary for Sweden',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A descriptive title for the itinerary' },
        totalDays: { type: 'number', description: 'Total number of days' },
        startCity: { type: 'string', description: 'Departure city' },
        endCity: { type: 'string', description: 'Arrival city' },
        stops: {
          type: 'array',
          description: 'Ordered list of overnight stops',
          items: {
            type: 'object',
            properties: {
              day: { type: 'number' },
              city: { type: 'string' },
              region: { type: 'string' },
              lat: { type: 'number' },
              lng: { type: 'number' },
              nights: { type: 'number' },
              highlights: { type: 'array', items: { type: 'string' } },
              accommodation: { type: 'string' },
              culinaryNotes: { type: 'string' },
            },
            required: ['day', 'city', 'region', 'lat', 'lng', 'nights', 'highlights', 'accommodation', 'culinaryNotes'],
          },
        },
        generatedAt: { type: 'string', description: 'ISO timestamp of generation' },
      },
      required: ['title', 'totalDays', 'startCity', 'endCity', 'stops', 'generatedAt'],
    },
  },
}

export const SYSTEM_PROMPT = `You are an expert Sweden road trip planner with deep knowledge of Swedish geography, culture, cuisine, and seasonal conditions.

When creating itineraries:
- Respect must-visit locations by including them as stops
- Exclude any cities in the avoid list
- Route logically from start to end city, minimising unnecessary backtracking
- Prefer off-the-beaten-track destinations over mass-tourism hotspots
- September is peak season in the spec — tailor recommendations accordingly
- Include realistic driving distances and times
- Always use the create_itinerary tool to return your response — never return free text`
```

- [ ] **Step 2: Verify TypeScript compiles (ignoring other files still using old imports)**

```bash
cd api && npx tsc --noEmit 2>&1 | grep itinerarySchema
```

Expected: no errors from `itinerarySchema.ts`.

- [ ] **Step 3: Commit**

```bash
git add api/src/lib/itinerarySchema.ts
git commit -m "feat(api): convert itinerary schema to OpenAI function calling format"
```

---

## Task 4: Update `generate.ts` and `generate.test.ts` (TDD)

**Files:**
- Modify: `api/src/functions/generate.test.ts`
- Modify: `api/src/functions/generate.ts`

- [ ] **Step 1: Update `generate.test.ts` — tests will now fail until generate.ts is updated**

Full new `api/src/functions/generate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Itinerary } from '../types'

vi.mock('../lib/llmClient', () => ({
  getLlmClient: vi.fn(),
  getModel: vi.fn(() => 'anthropic/claude-sonnet-4-6'),
}))

import { generateHandler } from './generate'
import { getLlmClient } from '../lib/llmClient'

function makeItinerary(): Itinerary {
  return {
    title: 'Test Trip',
    totalDays: 14,
    startCity: 'Amsterdam',
    endCity: 'Amsterdam',
    stops: [
      { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 1, highlights: ['Old Town'], accommodation: 'Boutique Hotel', culinaryNotes: 'Try kanelbullar' },
    ],
    generatedAt: '2026-06-01T00:00:00.000Z',
  }
}

function makeOpenAIResponse(itin: Itinerary, finishReason = 'tool_calls') {
  return {
    choices: [{
      finish_reason: finishReason,
      message: {
        tool_calls: finishReason === 'tool_calls' ? [{
          id: 'call_1',
          type: 'function',
          function: { name: 'create_itinerary', arguments: JSON.stringify(itin) },
        }] : null,
      },
    }],
  }
}

describe('POST /api/generate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a valid Itinerary on success', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14 }) } as any
    const result = await generateHandler(req)
    const body = JSON.parse(result.body as string) as Itinerary

    expect(result.status).toBe(200)
    expect(body.title).toBe('Test Trip')
    expect(body.stops).toHaveLength(1)
    expect(body.stops[0].city).toBe('Malmö')
  })

  it('returns 400 for invalid request body', async () => {
    const req = { method: 'POST', headers: { get: () => null }, json: async () => { throw new Error('bad json') } } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(400)
    expect(JSON.parse(result.body as string).error).toBeDefined()
  })

  it('returns 502 when model hits token limit', async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(makeItinerary(), 'length'))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(502)
    expect(JSON.parse(result.body as string).error).toContain('too long')
  })

  it('returns 502 when model returns no tool call', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { tool_calls: null } }],
    })
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(502)
    expect(JSON.parse(result.body as string).error).toBeDefined()
  })

  it('returns 500 on API error', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('rate limit'))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(500)
    expect(JSON.parse(result.body as string).error).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd api && npx vitest run src/functions/generate.test.ts 2>&1 | tail -15
```

Expected: FAIL — tests mock `llmClient` but `generate.ts` still imports from `anthropicClient`.

- [ ] **Step 3: Update `generate.ts`**

Full new `api/src/functions/generate.ts`:

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getLlmClient, getModel } from '../lib/llmClient'
import { ITINERARY_FUNCTION, SYSTEM_PROMPT } from '../lib/itinerarySchema'
import { withCors, corsPreflightResponse } from '../lib/cors'
import type { Itinerary, Preferences } from '../types'

function buildUserMessage(prefs: Preferences): string {
  const parts: string[] = [
    `Create a ${prefs.tripDays}-day Sweden road trip itinerary.`,
    `Start city: ${prefs.startCity}`,
    `End city: ${prefs.endCity}`,
  ]
  if (prefs.mustVisit.length > 0) parts.push(`Must include: ${prefs.mustVisit.join(', ')}`)
  if (prefs.avoid.length > 0) parts.push(`Avoid: ${prefs.avoid.join(', ')}`)
  parts.push('Plan logical routing, mix of famous and off-the-beaten-track stops, with authentic local recommendations.')
  return parts.join('\n')
}

function validateItinerary(data: unknown): data is Omit<Itinerary, 'generatedAt'> {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.title === 'string' &&
    typeof d.totalDays === 'number' &&
    typeof d.startCity === 'string' &&
    typeof d.endCity === 'string' &&
    Array.isArray(d.stops)
  )
}

export async function generateHandler(
  req: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const origin = req.headers?.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  let prefs: Preferences
  try {
    prefs = await req.json() as Preferences
  } catch {
    return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  if (!prefs || typeof prefs.tripDays !== 'number' || typeof prefs.startCity !== 'string' || typeof prefs.endCity !== 'string') {
    return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid preferences body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  try {
    const client = getLlmClient()
    const response = await client.chat.completions.create({
      model: getModel(),
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(prefs) },
      ],
      tools: [ITINERARY_FUNCTION],
      tool_choice: { type: 'function', function: { name: 'create_itinerary' } },
    })

    const choice = response.choices[0]
    if (choice.finish_reason === 'length') {
      return withCors({ status: 502, body: JSON.stringify({ error: 'Itinerary too long to generate — try fewer days' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const toolCall = choice.message.tool_calls?.[0]
    if (!toolCall || toolCall.function.name !== 'create_itinerary') {
      return withCors({ status: 502, body: JSON.stringify({ error: 'Model did not return a structured itinerary' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    let input: unknown
    try {
      input = JSON.parse(toolCall.function.arguments)
    } catch {
      return withCors({ status: 502, body: JSON.stringify({ error: 'Model returned unparseable itinerary arguments' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    if (!validateItinerary(input)) {
      console.error('validateItinerary failed. raw input:', JSON.stringify(input))
      return withCors({ status: 502, body: JSON.stringify({ error: 'Model returned an invalid itinerary structure' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const itinerary: Itinerary = { ...input, generatedAt: new Date().toISOString() }
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    }, origin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return withCors({ status: 500, body: JSON.stringify({ error: `Generation failed: ${msg}` }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('generate', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate',
  handler: generateHandler,
})
```

- [ ] **Step 4: Run all API tests — verify all pass**

```bash
cd api && npm test 2>&1 | tail -15
```

Expected: all test files pass (llmClient, generate, itineraries, preferences, health, tableClient). Total should be ≥ 20 tests.

- [ ] **Step 5: Verify TypeScript build is clean**

```bash
cd api && npm run build 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/functions/generate.ts api/src/functions/generate.test.ts
git commit -m "feat(api): update generate handler to use OpenRouter via OpenAI SDK"
```

---

## Task 5: Update `docs/api.md`

**Files:**
- Modify: `docs/api.md`

- [ ] **Step 1: Add LLM Provider section**

Open `docs/api.md` and add the following section after the existing introduction / before the endpoints section:

```markdown
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

Copy `.env.example` to `.env` in the `api/` directory (create it if it doesn't exist):

```
OPENROUTER_API_KEY=sk-or-...
LLM_MODEL=anthropic/claude-sonnet-4-6
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/api.md
git commit -m "docs: document OpenRouter LLM provider configuration and model switching"
```

---

## Task 6: Smoke Test and Push

- [ ] **Step 1: Run full test suite one more time**

```bash
cd api && npm test
```

Expected: all tests pass, zero failures.

- [ ] **Step 2: Push to remote**

```bash
git push
```

Expected: GitHub Actions deploy workflow triggers. Monitor at `https://github.com/toinevl/SwedenTravel/actions`.

- [ ] **Step 3: Update Azure App Settings**

In **Azure Portal → Function App `sweden-travel-api` → Configuration → Application settings**:
1. Add `OPENROUTER_API_KEY` with value from openrouter.ai dashboard
2. Add `LLM_MODEL` = `anthropic/claude-sonnet-4-6` (optional — this is the default)
3. Delete `ANTHROPIC_API_KEY`
4. Click **Save** → restart

- [ ] **Step 4: Live smoke test**

Once the deploy is green, generate a 21-day itinerary (the case that previously broke) and verify it returns successfully.
