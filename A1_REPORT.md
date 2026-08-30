# A1 Report — CR-01: Information Disclosure in Error Responses

## What Changed

**File edited:** `api/src/functions/generate.ts`

**Catch block (lines 283-288)** was cleaned up to eliminate information disclosure:

- **Removed** an unused `msg` variable (`const msg = err instanceof Error ? err.message : 'Unknown error'`) that computed the raw error message string but was never used — dead code that could risk accidental exposure if referenced later.
- **Kept** the `endpoint` (`AZURE_FOUNDRY_ENDPOINT`) and `model` (`LLM_MODEL`) variables — these are now used **exclusively** in the server-side `logError()` call, preserving diagnostic visibility for operators.
- **Updated** the user-facing error message from `"Generation failed. Please try again."` to `"Generation failed. Please try again later."` to match the specified generic text.
- **Verified** the response body (`JSON.stringify({ error: 'Generation failed. Please try again later.' })`) contains no `endpoint` or `model` fields.
- **Preserved** the `withCors()` wrapper and ASCII-only `Content-Type: application/json` header (per CLAUDE.md §HTTP response headers).
- **Preserved** all TypeScript types (`InvocationContext`, `HttpResponseInit`, `HttpRequest`, etc.) and the `logError` signature.

## Line Range Edited

Lines 283-288 (the `catch (err)` block in `generateHandler`).

## Verification

1. **`npm run build` (tsc)** — completed successfully with exit code 0, no TypeScript errors.
2. **`npx tsc --noEmit`** — type-check passed, no errors or warnings.
3. **Grep for disclosure** — confirmed `endpoint` and `model` variables appear only in:
   - Variable declarations (lines 284-285)
   - The `logError()` call (line 286) — server-side only
   - The LLM `client.chat.completions.create()` call (line 167) — unrelated to error responses
   - **No** occurrence of `endpoint`, `AZURE_FOUNDRY_ENDPOINT`, `LLM_MODEL`, or model name in the response body (line 287).
4. **Response body** (line 287): `{ error: 'Generation failed. Please try again later.' }` — generic, no infrastructure details.
5. **HTTP response header** (`Content-Type: application/json`) — ASCII-only.
