import OpenAI from 'openai'

export function getLlmClient(): OpenAI {
  const key = process.env.AZURE_FOUNDRY_API_KEY
  if (!key?.trim()) throw new Error('AZURE_FOUNDRY_API_KEY is not configured')
  const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT
  if (!endpoint?.trim()) throw new Error('AZURE_FOUNDRY_ENDPOINT is not configured')
  return new OpenAI({
    baseURL: endpoint,
    apiKey: key,
  })
}

export function getModel(): string {
  return process.env.LLM_MODEL ?? 'gpt-4o'
}
