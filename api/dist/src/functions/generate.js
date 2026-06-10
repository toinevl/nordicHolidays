"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHandler = generateHandler;
const functions_1 = require("@azure/functions");
const llmClient_1 = require("../lib/llmClient");
const itinerarySchema_1 = require("../lib/itinerarySchema");
const cors_1 = require("../lib/cors");
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
async function generateHandler(req, _ctx) {
    const origin = req.headers?.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    let prefs;
    let lang = 'en';
    try {
        const body = await req.json();
        prefs = body;
        if (body.lang === 'nl')
            lang = 'nl';
    }
    catch {
        return (0, cors_1.withCors)({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin);
    }
    if (!prefs || typeof prefs.tripDays !== 'number' || typeof prefs.startCity !== 'string' || typeof prefs.endCity !== 'string') {
        return (0, cors_1.withCors)({ status: 400, body: JSON.stringify({ error: 'Invalid preferences body' }), headers: { 'Content-Type': 'application/json' } }, origin);
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
            return (0, cors_1.withCors)({ status: 502, body: JSON.stringify({ error: 'Itinerary too long to generate — try fewer days' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        const toolCall = choice.message.tool_calls?.[0];
        if (!toolCall || toolCall.function.name !== 'create_itinerary') {
            return (0, cors_1.withCors)({ status: 502, body: JSON.stringify({ error: 'Model did not return a structured itinerary' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        let input;
        try {
            input = JSON.parse(toolCall.function.arguments);
        }
        catch {
            return (0, cors_1.withCors)({ status: 502, body: JSON.stringify({ error: 'Model returned unparseable itinerary arguments' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        if (!validateItinerary(input)) {
            console.error('validateItinerary failed. raw input:', JSON.stringify(input));
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
        console.error(`Generation error — endpoint: ${endpoint}, model: ${model}, error: ${msg}`);
        return (0, cors_1.withCors)({ status: 500, body: JSON.stringify({ error: `Generation failed: ${msg}`, endpoint, model }), headers: { 'Content-Type': 'application/json' } }, origin);
    }
}
functions_1.app.http('generate', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'generate',
    handler: generateHandler,
});
