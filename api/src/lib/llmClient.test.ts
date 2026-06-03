import { describe, it, expect, afterEach } from 'vitest'

describe('getLlmClient', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
  })

  it('throws if OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY
    const { getLlmClient } = await import('./llmClient')
    expect(() => getLlmClient()).toThrow('OPENROUTER_API_KEY is not configured')
  })

  it('returns an object with chat.completions.create when key is set', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const { getLlmClient } = await import('./llmClient')
    const client = getLlmClient()
    expect(client.chat.completions.create).toBeDefined()
  })
})

describe('getModel', () => {
  afterEach(() => {
    delete process.env.LLM_MODEL
  })

  it('defaults to anthropic/claude-sonnet-4-6', async () => {
    delete process.env.LLM_MODEL
    const { getModel } = await import('./llmClient')
    expect(getModel()).toBe('anthropic/claude-sonnet-4-6')
  })

  it('returns LLM_MODEL env var when set', async () => {
    process.env.LLM_MODEL = 'openai/gpt-4o'
    const { getModel } = await import('./llmClient')
    expect(getModel()).toBe('openai/gpt-4o')
  })
})
