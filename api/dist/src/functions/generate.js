"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHandler = generateHandler;
const functions_1 = require("@azure/functions");
const llmClient_1 = require("../lib/llmClient");
const itinerarySchema_1 = require("../lib/itinerarySchema");
const cors_1 = require("../lib/cors");
const identity_1 = require("../lib/identity");
const rateLimit_1 = require("../lib/rateLimit");
const schemas_1 = require("../lib/schemas");
function buildUserMessage(prefs, lang = 'en') {
    const parts = [
        `Create a ${prefs.tripDays}-day Sweden road trip itinerary.`,
        `Start city: ${prefs.startCity}`,
        `End city: ${prefs.endCity}`,
    ];
    if (prefs.mustVisit.length > 0)
        parts.push(`Must include: ${prefs.mustVisit.join(', ')}`);
    if (prefs.avoid.length > 0)
        parts.push(`Avoid: ${prefs.avoid.join(', ')}`);
    parts.push('Plan logical routing, mix of famous and off-the-beaten-track stops, with authentic local recommendations.');
    parts.push(lang === 'nl'
        ? 'Genereer de reisroute in het Nederlands.'
        : 'Generate the itinerary in English.');
    return parts.join('\n');
}
function validateItinerary(data) {
    if (!data || typeof data !== 'object')
        return false;
    const d = data;
    return (typeof d.title === 'string' &&
        typeof d.totalDays === 'number' &&
        typeof d.startCity === 'string' &&
        typeof d.endCity === 'string' &&
        Array.isArray(d.stops));
}
async function generateHandler(req, ctx) {
    const origin = req.headers?.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    // Resolve identity first (required for rate limiting)
    let ownerId;
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req, ctx);
        ownerId = owner.ownerId;
    }
    catch (err) {
        return (0, identity_1.authErrorResponse)(err, origin);
    }
    let rawBody;
    try {
        rawBody = await req.json();
    }
    catch (err) {
        (0, schemas_1.logError)(ctx, 'generateHandler: invalid JSON body', err);
        return (0, cors_1.withCors)({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin);
    }
    // Validate and parse body with zod; on failure, return 400 with details
    const parseResult = schemas_1.GenerateRequestBodySchema.safeParse(rawBody);
    if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ');
        (0, schemas_1.logError)(ctx, `generateHandler: validation failed - ${errors}`, parseResult.error);
        return (0, cors_1.withCors)({
            status: 400,
            body: JSON.stringify({ error: 'Invalid request body', details: errors }),
            headers: { 'Content-Type': 'application/json' }
        }, origin);
    }
    const body = parseResult.data;
    const prefs = {
        mustVisit: body.mustVisit,
        avoid: body.avoid,
        startCity: body.startCity,
        endCity: body.endCity,
        tripDays: body.tripDays,
        country: body.country,
    };
    const lang = body.lang;
    // Check rate limits
    const rateLimitResult = await (0, rateLimit_1.checkAndIncrementRateLimit)(req, ownerId, ctx);
    if (!rateLimitResult.allowed) {
        const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600;
        return (0, cors_1.withCors)({
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(retryAfter),
            },
            body: JSON.stringify({
                error: 'Rate limit exceeded',
                retryAfterSeconds: retryAfter,
            }),
        }, origin);
    }
    try {
        const client = (0, llmClient_1.getLlmClient)();
        const response = await client.chat.completions.create({
            model: (0, llmClient_1.getModel)(),
            max_completion_tokens: 8192,
            messages: [
                { role: 'system', content: itinerarySchema_1.SYSTEM_PROMPT },
                { role: 'user', content: buildUserMessage(prefs, lang) },
            ],
            tools: [itinerarySchema_1.ITINERARY_FUNCTION],
            tool_choice: 'required',
        });
        const choice = response.choices[0];
        if (choice.finish_reason === 'length') {
            (0, schemas_1.logError)(ctx, 'generateHandler: model returned length overflow');
            return (0, cors_1.withCors)({ status: 502, body: JSON.stringify({ error: 'Itinerary too long to generate — try fewer days' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        const toolCall = choice.message.tool_calls?.[0];
        if (!toolCall || toolCall.function.name !== 'create_itinerary') {
            (0, schemas_1.logError)(ctx, 'generateHandler: model did not return structured tool call', { toolCall });
            return (0, cors_1.withCors)({ status: 502, body: JSON.stringify({ error: 'Model did not return a structured itinerary' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        let input;
        try {
            input = JSON.parse(toolCall.function.arguments);
        }
        catch (err) {
            (0, schemas_1.logError)(ctx, 'generateHandler: failed to parse tool arguments', err);
            return (0, cors_1.withCors)({ status: 502, body: JSON.stringify({ error: 'Model returned unparseable itinerary arguments' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        if (!validateItinerary(input)) {
            (0, schemas_1.logError)(ctx, 'generateHandler: validateItinerary failed', { input: JSON.stringify(input) });
            return (0, cors_1.withCors)({ status: 502, body: JSON.stringify({ error: 'Model returned an invalid itinerary structure' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        const itinerary = { ...input, generatedAt: new Date().toISOString() };
        return (0, cors_1.withCors)({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itinerary),
        }, origin);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT ?? '(not set)';
        const model = process.env.LLM_MODEL ?? 'gpt-4o';
        (0, schemas_1.logError)(ctx, `generateHandler: generation error - endpoint: ${endpoint}, model: ${model}`, err);
        return (0, cors_1.withCors)({ status: 500, body: JSON.stringify({ error: `Generation failed: ${msg}`, endpoint, model }), headers: { 'Content-Type': 'application/json' } }, origin);
    }
}
functions_1.app.http('generate', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'generate',
    handler: generateHandler,
});
