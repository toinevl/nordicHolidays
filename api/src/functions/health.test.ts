import { describe, it, expect } from 'vitest'
import { healthHandler } from './health'

describe('health endpoint', () => {
  it('returns 200 with status ok', async () => {
    const result = await healthHandler()
    expect(result.status).toBe(200)
    expect(result.body).toContain('ok')
  })
})
