import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProfileHandler, putProfileHandler } from '../functions/profile'
import { ownerFromBearer } from '../lib/identity'
import { getTableClient } from '../lib/tableClient'

vi.mock('../lib/identity')
vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(() => ({
    getEntity: vi.fn(),
    upsertEntity: vi.fn().mockResolvedValue(undefined),
  })),
}))

const owner = { partitionKey: 'profile', rowKey: 'entra-sub-1', ownerId: 'entra-sub-1', createdAt: '2026-01-01', updatedAt: '2026-01-02' }

describe('GET /api/profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when profile does not exist', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }), upsertEntity: vi.fn() })

    const result = await getProfileHandler({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) } as any, {} as any, undefined)
    expect(result.status).toBe(404)
  })

  it('returns profile when it exists', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue({ getEntity: vi.fn().mockResolvedValue(owner), upsertEntity: vi.fn() })

    const result = await getProfileHandler({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) } as any, {} as any, owner)
    expect(result.status).toBe(200)
  })
})

describe('PUT /api/profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 for invalid body', async () => {
    const result = await putProfileHandler(
      { method: 'PUT', headers: new Map([['origin', 'http://localhost']]), json: async () => { throw new Error('bad') } } as any,
      {} as any,
    )
    expect(result.status).toBe(400)
  })
})
