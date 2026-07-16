import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./tableClient', () => ({
  getTableClient: vi.fn(),
}))

import { getPartner, listPartners, clearPartnerCache } from './partners'
import { getTableClient } from './tableClient'

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    getEntity: vi.fn(),
    createEntity: vi.fn().mockResolvedValue(undefined),
    listEntities: vi.fn(),
    ...overrides,
  }
}

// A realistic partner config entity from Table Storage, including a non-ASCII
// displayName (Västra Götaland is a real Swedish region — the app's actual
// data is never ASCII-only, per CLAUDE.md).
const partnerEntity = {
  partitionKey: 'partners',
  rowKey: 'camping-nord',
  displayName: 'Camping Nord — Västra Götaland',
  primaryColor: '#1a5276',
  accentColor: '#f39c12',
  affiliateTravelpayouts: 'tp-123',
  affiliateGyg: 'gyg-456',
  generateQuotaPerMonth: 100,
  rateLimitPerHour: 20,
  leadCaptureEmail: 'leads@camping-nord.se',
  createdAt: '2026-07-01T00:00:00.000Z',
}

describe('getPartner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearPartnerCache()
  })

  it('returns a config for a known partner', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue(partnerEntity),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const config = await getPartner('camping-nord')

    expect(config).not.toBeNull()
    expect(config!.partnerId).toBe('camping-nord')
    expect(config!.displayName).toBe('Camping Nord — Västra Götaland')
    expect(config!.primaryColor).toBe('#1a5276')
    expect(config!.accentColor).toBe('#f39c12')
    expect(config!.affiliateIds.travelpayouts).toBe('tp-123')
    expect(config!.affiliateIds.gyg).toBe('gyg-456')
    expect(config!.generateQuotaPerMonth).toBe(100)
    expect(config!.rateLimitPerHour).toBe(20)
    expect(config!.leadCaptureEmail).toBe('leads@camping-nord.se')
    expect(config!.createdAt).toBe('2026-07-01T00:00:00.000Z')
  })

  it('returns null for an unknown partner', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const config = await getPartner('does-not-exist')
    expect(config).toBeNull()
  })

  it('returns null when the Partners table does not exist yet', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404, errorCode: 'TableNotFound' }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const config = await getPartner('camping-nord')
    expect(config).toBeNull()
  })

  it('caches the result so the second call within 5 minutes does not hit the table', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue(partnerEntity),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    await getPartner('camping-nord')
    await getPartner('camping-nord')

    // Only one call to getEntity — the second lookup was served from cache
    expect(client.getEntity).toHaveBeenCalledTimes(1)
  })

  it('caches null results too (does not hammer the table for unknown partners)', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    await getPartner('unknown')
    await getPartner('unknown')

    expect(client.getEntity).toHaveBeenCalledTimes(1)
  })

  it('handles missing affiliate IDs gracefully', async () => {
    const entityWithoutAffiliates = {
      ...partnerEntity,
      affiliateTravelpayouts: undefined,
      affiliateGyg: undefined,
      affiliateDiscovercars: undefined,
    }
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue(entityWithoutAffiliates),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const config = await getPartner('camping-nord')
    expect(config).not.toBeNull()
    expect(Object.keys(config!.affiliateIds)).toHaveLength(0)
  })
})

describe('listPartners', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearPartnerCache()
  })

  it('returns an array of partner configs', async () => {
    const entities = [partnerEntity, { ...partnerEntity, rowKey: 'tromsø-tours', displayName: 'Tromsø Tours' }]
    const client = makeClient({
      listEntities: vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          for (const e of entities) yield e
        },
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const partners = await listPartners()

    expect(partners).toHaveLength(2)
    expect(partners[0].partnerId).toBe('camping-nord')
    expect(partners[0].displayName).toBe('Camping Nord — Västra Götaland')
    expect(partners[1].partnerId).toBe('tromsø-tours')
    expect(partners[1].displayName).toBe('Tromsø Tours')
  })

  it('returns an empty array when the table does not exist', async () => {
    const client = makeClient({
      listEntities: vi.fn().mockImplementation(() => {
        throw { statusCode: 404, errorCode: 'TableNotFound' }
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const partners = await listPartners()
    expect(partners).toEqual([])
  })
})
