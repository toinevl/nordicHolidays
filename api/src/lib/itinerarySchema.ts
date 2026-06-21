import type OpenAI from 'openai'

export const ITINERARY_FUNCTION: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_itinerary',
    description: 'Create a structured road trip itinerary for the Nordics',
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

export const SYSTEM_PROMPT = `You are an expert Nordic road trip planner with deep knowledge of geography, culture, cuisine, and seasonal conditions across Sweden, Norway, Denmark, Finland, and related Nordic destinations.

When creating itineraries:
- Respect must-visit locations by including them as stops
- Exclude any cities in the avoid list
- Route logically from start to end city, minimising unnecessary backtracking
- Prefer off-the-beaten-track destinations over mass-tourism hotspots
- September is peak season in the spec — tailor recommendations accordingly
- Include realistic driving distances and times
- Always use the create_itinerary tool to return your response — never return free text`
