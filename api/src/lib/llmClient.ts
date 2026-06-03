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
