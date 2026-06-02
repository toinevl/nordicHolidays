import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('getAnthropicClient', () => {
  beforeEach(() => vi.resetModules())

  it('throws if ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { getAnthropicClient } = await import('./anthropicClient')
    expect(() => getAnthropicClient()).toThrow('ANTHROPIC_API_KEY')
  })

  it('returns client when key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { getAnthropicClient } = await import('./anthropicClient')
    const client = getAnthropicClient()
    expect(client).toBeDefined()
  })
})
