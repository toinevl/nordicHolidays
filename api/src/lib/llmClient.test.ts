import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

describe('getLlmClient', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => {
    delete process.env.AZURE_FOUNDRY_API_KEY
    delete process.env.AZURE_FOUNDRY_ENDPOINT
  })

  it('throws if AZURE_FOUNDRY_API_KEY is not set', async () => {
    delete process.env.AZURE_FOUNDRY_API_KEY
    process.env.AZURE_FOUNDRY_ENDPOINT = 'https://my-resource.services.ai.azure.com/models'
    const { getLlmClient } = await import('./llmClient')
    expect(() => getLlmClient()).toThrow('AZURE_FOUNDRY_API_KEY is not configured')
  })

  it('throws if AZURE_FOUNDRY_API_KEY is whitespace only', async () => {
    process.env.AZURE_FOUNDRY_API_KEY = '   '
    process.env.AZURE_FOUNDRY_ENDPOINT = 'https://my-resource.services.ai.azure.com/models'
    const { getLlmClient } = await import('./llmClient')
    expect(() => getLlmClient()).toThrow('AZURE_FOUNDRY_API_KEY is not configured')
  })

  it('throws if AZURE_FOUNDRY_ENDPOINT is not set', async () => {
    process.env.AZURE_FOUNDRY_API_KEY = 'test-key'
    delete process.env.AZURE_FOUNDRY_ENDPOINT
    const { getLlmClient } = await import('./llmClient')
    expect(() => getLlmClient()).toThrow('AZURE_FOUNDRY_ENDPOINT is not configured')
  })

  it('returns a client pointed at the Azure Foundry endpoint when configured', async () => {
    process.env.AZURE_FOUNDRY_API_KEY = 'test-key'
    process.env.AZURE_FOUNDRY_ENDPOINT = 'https://my-resource.services.ai.azure.com/models'
    const { getLlmClient } = await import('./llmClient')
    const client = getLlmClient()
    expect((client as any).baseURL).toContain('services.ai.azure.com')
  })
})

describe('getModel', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { delete process.env.LLM_MODEL })

  it('defaults to the production model (gpt-5.4-nano)', async () => {
    delete process.env.LLM_MODEL
    const { getModel } = await import('./llmClient')
    expect(getModel()).toBe('gpt-5.4-nano')
  })

  it('returns LLM_MODEL env var when set', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini'
    const { getModel } = await import('./llmClient')
    expect(getModel()).toBe('gpt-4o-mini')
  })
})
