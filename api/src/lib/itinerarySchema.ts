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
          description: 'Ordered list of stops. A stop is either an overnight base (nights >= 1, the traveller sleeps here) or a day trip (nights = 0, visited from the most recent overnight base, returning the same day).',
          items: {
            type: 'object',
            properties: {
              day: { type: 'number' },
              city: { type: 'string', description: 'This stop\'s own destination name. For a day trip, the excursion destination (e.g. Marstrand as a day trip from a Göteborg base) — never a repeat of the base city\'s name.' },
              region: { type: 'string' },
              lat: { type: 'number', description: 'Latitude of this stop\'s own location. For a day trip, the excursion destination\'s coordinates, not the base\'s.' },
              lng: { type: 'number', description: 'Longitude of this stop\'s own location. For a day trip, the excursion destination\'s coordinates, not the base\'s.' },
              nights: { type: 'number', description: '0 for a day trip taken from the previous overnight base; 1 or more when sleeping here. The first stop must have nights >= 1.' },
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
- Always use the create_itinerary tool to return your response — never return free text
- Prefer hub-and-spoke structure: stay 2-3 nights at well-located bases and take day trips (nights: 0) to nearby highlights instead of relocating every day
- A day trip must be within roughly 1.5 hours' drive of its base, out and back the same day
- A day trip stop must name the excursion destination itself and use that destination's own lat/lng — never repeat the base city's name or coordinates (e.g. Marstrand with Marstrand's coordinates as a day trip from a Göteborg base)
- The first and last stops must be overnight bases (nights >= 1)
- totalDays must remain consistent with the sum of nights`
