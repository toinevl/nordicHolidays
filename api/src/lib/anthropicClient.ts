import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  if (!client) client = new Anthropic({ apiKey: key })
  return client
}
