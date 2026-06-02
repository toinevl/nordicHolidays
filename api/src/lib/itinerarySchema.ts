import type Anthropic from '@anthropic-ai/sdk'

export const ITINERARY_TOOL: Anthropic.Tool = {
  name: 'create_itinerary',
  description: 'Create a structured road trip itinerary for Sweden',
  input_schema: {
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
