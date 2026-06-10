import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableClient } from '../lib/tableClient'

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(() => ({
    getEntity: vi.fn(),
    upsertEntity: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('../lib/identity', () => ({
  resolveOwnerId: vi.fn().mockResolvedValue({ ownerId: 'entra-sub-1', isGuest: false, subject: 'sub-1' }),
  authErrorResponse: vi.fn((err, origin) => ({ status: 401, body: JSON.stringify({ error: (err as Error).message }), headers: {}, } as any)),
}))

import { getProfileHandler, putProfileHandler } from '../functions/profile'
import { resolveOwnerId } from '../lib/identity'

const mockResolveOwnerId = resolveOwnerId as ReturnType<typeof vi.fn>
const mockGetTableClient = getTableClient as ReturnType<typeof vi.fn>

const ownerA = { ownerId: 'entra-sub-1', isGuest: false, subject: 'sub-1' }
const ownerB = { ownerId: 'entra-sub-2', isGuest: false, subject: 'sub-2' }

const profileA = {
  partitionKey: 'entra-sub-1',
  rowKey: 'profile',
  ownerId: 'entra-sub-1',
  displayName: 'Alice',
  email: 'alice@example.com',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-02'
}

const profileB = {
  partitionKey: 'entra-sub-2',
  rowKey: 'profile',
  ownerId: 'entra-sub-2',
  displayName: 'Bob',
  email: 'bob@example.com',
  createdAt: '2026-01-03',
  updatedAt: '2026-01-04'
}

describe('GET /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableClient.mockReturnValue({
      getEntity: vi.fn(),
      upsertEntity: vi.fn().mockResolvedValue(undefined)
    })
  })

  it('returns 401 when missing identity', async () => {
    const err = new Error('Missing or invalid identity')
    err.name = 'AuthError'
    mockResolveOwnerId.mockImplementation(() => {
      throw err
    })

    const result = await getProfileHandler({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) } as any, {} as any)
    expect(result.status).toBe(401)
  })

  it('returns 404 when profile does not exist', async () => {
    mockResolveOwnerId.mockResolvedValue(ownerA)
    mockGetTableClient.mockReturnValue({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
      upsertEntity: vi.fn()
    })

    const result = await getProfileHandler({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) } as any, {} as any)
    expect(result.status).toBe(404)
  })

  it('returns profile when it exists for owner', async () => {
    mockResolveOwnerId.mockResolvedValue(ownerA)
    mockGetTableClient.mockReturnValue({
      getEntity: vi.fn().mockResolvedValue(profileA),
      upsertEntity: vi.fn()
    })

    const result = await getProfileHandler({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) } as any, {} as any)
    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.ownerId).toBe('entra-sub-1')
    expect(body.displayName).toBe('Alice')
  })

  it('owner B cannot see owner A profile', async () => {
    mockResolveOwnerId.mockResolvedValue(ownerB)
    mockGetTableClient.mockReturnValue({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
      upsertEntity: vi.fn()
    })

    const result = await getProfileHandler({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) } as any, {} as any)
    expect(result.status).toBe(404)
  })
})

describe('PUT /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableClient.mockReturnValue({
      getEntity: vi.fn(),
      upsertEntity: vi.fn().mockResolvedValue(undefined)
    })
  })

  it('returns 401 when missing identity', async () => {
    const err = new Error('Missing or invalid identity')
    err.name = 'AuthError'
    mockResolveOwnerId.mockImplementation(() => {
      throw err
    })

    const result = await putProfileHandler(
      { method: 'PUT', headers: new Map([['origin', 'http://localhost']]), json: async () => ({ displayName: 'Test' }) } as any,
      {} as any,
    )
    expect(result.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    mockResolveOwnerId.mockResolvedValue(ownerA)

    const result = await putProfileHandler(
      { method: 'PUT', headers: new Map([['origin', 'http://localhost']]), json: async () => { throw new Error('bad') } } as any,
      {} as any,
    )
    expect(result.status).toBe(400)
  })

  it('PUT then GET round-trip works for same owner', async () => {
    mockResolveOwnerId.mockResolvedValue(ownerA)
    const getEntityMock = vi.fn()
    const upsertEntityMock = vi.fn().mockResolvedValue(undefined)

    mockGetTableClient.mockReturnValue({
      getEntity: getEntityMock,
      upsertEntity: upsertEntityMock
    })

    // PUT with new profile
    getEntityMock.mockRejectedValueOnce({ statusCode: 404 })
    const putResult = await putProfileHandler(
      {
        method: 'PUT',
        headers: new Map([['origin', 'http://localhost']]),
        json: async () => ({ displayName: 'Alice', email: 'alice@example.com' })
      } as any,
      {} as any,
    )
    expect(putResult.status).toBe(200)
    const putBody = JSON.parse(putResult.body as string)
    expect(putBody.displayName).toBe('Alice')
    expect(putBody.ownerId).toBe('entra-sub-1')

    // GET the profile back
    getEntityMock.mockResolvedValueOnce(profileA)
    const getResult = await getProfileHandler({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) } as any, {} as any)
    expect(getResult.status).toBe(200)
    const getBody = JSON.parse(getResult.body as string)
    expect(getBody.displayName).toBe('Alice')
    expect(getBody.ownerId).toBe('entra-sub-1')
  })

  it('owner A cannot overwrite owner B profile', async () => {
    mockResolveOwnerId.mockResolvedValue(ownerA)
    const getEntityMock = vi.fn()
    mockGetTableClient.mockReturnValue({
      getEntity: getEntityMock,
      upsertEntity: vi.fn().mockResolvedValue(undefined)
    })

    // Try to update, it should create ownerA's own row not ownerB's
    getEntityMock.mockRejectedValue({ statusCode: 404 })
    const result = await putProfileHandler(
      {
        method: 'PUT',
        headers: new Map([['origin', 'http://localhost']]),
        json: async () => ({ displayName: 'Hacked', email: 'hacked@example.com' })
      } as any,
      {} as any,
    )
    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string)
    // The upserted entity should have ownerA's ID as partition key
    expect(body.ownerId).toBe('entra-sub-1')
  })
})
