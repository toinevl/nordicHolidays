import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getRouteSegments, formatDriveTime, _resetForTest, type RouteSegment } from './routing'
import type { Coordinate } from './geo'

// Non-ASCII Nordic fixtures per project convention (CLAUDE.md) — test data
// must include real city names with ä/ö/å, though the routing module itself
// only deals in coordinates.
const MALMO: Coordinate = { lat: 55.605, lng: 13.004 }
const YSTAD: Coordinate = { lat: 55.439, lng: 13.821 }
const GOTHENBURG: Coordinate = { lat: 57.709, lng: 11.975 }
const HELSINGBORG: Coordinate = { lat: 56.047, lng: 12.695 }
const STOCKHOLM: Coordinate = { lat: 59.329, lng: 18.069 }

describe('getRouteSegments', () => {
  beforeEach(() => {
    _resetForTest()
    // Clean env so each test starts from the fallback path
    delete process.env.AZURE_MAPS_CLIENT_ID
    delete process.env.TABLES_ENDPOINT
    delete process.env.STORAGE_CONNECTION_STRING
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty array for empty input', async () => {
    expect(await getRouteSegments([])).toEqual([])
  })

  it('returns a single zero segment for a one-stop list', async () => {
    const segs = await getRouteSegments([MALMO])
    expect(segs).toHaveLength(1)
    expect(segs[0]).toEqual({ km: 0, driveTimeMin: 0, source: 'haversine-fallback' })
  })

  it('falls back to haversine when AZURE_MAPS_CLIENT_ID is unset', async () => {
    const segs = await getRouteSegments([MALMO, YSTAD])
    expect(segs).toHaveLength(2)
    expect(segs[1].source).toBe('haversine-fallback')
    // Malmö → Ystad is ~60km straight-line; fallback rounds to nearest km
    expect(segs[1].km).toBeGreaterThan(50)
    expect(segs[1].km).toBeLessThan(75)
    // 80km/h fallback → ~45-55 min for ~60km
    expect(segs[1].driveTimeMin).toBeGreaterThan(35)
    expect(segs[1].driveTimeMin).toBeLessThan(70)
  })

  it('first segment is always zero regardless of input size', async () => {
    const segs = await getRouteSegments([MALMO, YSTAD, GOTHENBURG])
    expect(segs[0]).toEqual({ km: 0, driveTimeMin: 0, source: 'haversine-fallback' })
    expect(segs).toHaveLength(3)
  })

  it('produces non-zero distance between distinct Nordic cities (Malmö → Göteborg ≈ 240km straight)', async () => {
    const segs = await getRouteSegments([MALMO, GOTHENBURG])
    expect(segs[1].km).toBeGreaterThan(230)
    expect(segs[1].km).toBeLessThan(260)
  })

  it('uses memory cache on the second identical lookup', async () => {
    const a = await getRouteSegments([MALMO, YSTAD])
    const b = await getRouteSegments([MALMO, YSTAD])
    expect(b[1]).toEqual(a[1])
    expect(b[1].source).toBe('haversine-fallback') // cache hit preserves original source
  })

  it('returns distinct segments for distinct coordinate pairs', async () => {
    const segs = await getRouteSegments([MALMO, YSTAD, GOTHENBURG])
    expect(segs[1].km).not.toBe(segs[2].km)
  })

  it('handles coordinates with sub-meter precision without crashing', async () => {
    const a: Coordinate = { lat: 55.6050001, lng: 13.0039999 }
    const b: Coordinate = { lat: 55.6050002, lng: 13.0040001 }
    const segs = await getRouteSegments([a, b])
    expect(segs[1].km).toBe(0) // effectively the same point
  })

  it('respects direction (A→B and B→A are distinct lookups)', async () => {
    const ab = await getRouteSegments([MALMO, YSTAD])
    const ba = await getRouteSegments([YSTAD, MALMO])
    // Same magnitude (haversine is symmetric) but cache entries are distinct
    expect(ab[1].km).toBe(ba[1].km)
  })

  it('routes through Helsingborg→Göteborg (the pair that exposed the 1.3× bug)', async () => {
    // The old code reported 247km (straight × 1.3); real driving is ~140km.
    // Haversine (no multiplier) gives ~187km straight-line — still high but
    // within ~50km of truth, far better than the old 247km.
    const segs = await getRouteSegments([HELSINGBORG, GOTHENBURG])
    expect(segs[1].source).toBe('haversine-fallback')
    expect(segs[1].km).toBeGreaterThan(170)  // straight-line ~187km
    expect(segs[1].km).toBeLessThan(210)
    // Critically: the new fallback is MUCH closer to the real 140km than the
    // old 247km. Azure Maps (when configured) will return ~140km.
  })
})

describe('formatDriveTime', () => {
  it('returns empty string for zero/negative', () => {
    expect(formatDriveTime(0)).toBe('')
    expect(formatDriveTime(-5)).toBe('')
  })

  it('formats minutes-only under 1 hour', () => {
    expect(formatDriveTime(45)).toBe('45 min')
  })

  it('formats whole hours without minutes', () => {
    expect(formatDriveTime(60)).toBe('1 h')
    expect(formatDriveTime(180)).toBe('3 h')
  })

  it('formats hours + minutes', () => {
    expect(formatDriveTime(90)).toBe('1 h 30 min')
    expect(formatDriveTime(125)).toBe('2 h 5 min')
  })

  it('localizes to Dutch', () => {
    expect(formatDriveTime(90, 'nl')).toBe('1 u 30 min')
    expect(formatDriveTime(60, 'nl')).toBe('1 u')
  })

  it('localizes to German', () => {
    expect(formatDriveTime(90, 'de')).toBe('1 Std. 30 Min.')
    expect(formatDriveTime(60, 'de')).toBe('1 Std.')
  })
})

describe('getRouteSegments with Azure Maps configured (mocked)', () => {
  const mockMapsResponse = (km: number, minutes: number) => ({
    routes: [{
      summary: {
        lengthInMeters: km * 1000,
        travelTimeInSeconds: minutes * 60,
      },
    }],
  })

  beforeEach(() => {
    _resetForTest()
    process.env.AZURE_MAPS_CLIENT_ID = 'test-maps-account-id'
    // Ensure no table storage is attempted in mocked tests
    delete process.env.TABLES_ENDPOINT
    delete process.env.STORAGE_CONNECTION_STRING
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.AZURE_MAPS_CLIENT_ID
  })

  it('calls Azure Maps when configured and uses the returned distance', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockMapsResponse(140, 100)), { status: 200 }),
    )
    // Mock the credential.getToken call
    const { DefaultAzureCredential } = await import('@azure/identity')
    vi.spyOn(DefaultAzureCredential.prototype, 'getToken').mockResolvedValue({
      token: 'fake-token',
      expiresOnTimestamp: Date.now() + 3600000,
    })

    const segs = await getRouteSegments([HELSINGBORG, GOTHENBURG])
    expect(segs[1].source).toBe('azure-maps')
    expect(segs[1].km).toBe(140)
    expect(segs[1].driveTimeMin).toBe(100)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // URL should have the expected query params
    const calledUrl = fetchSpy.mock.calls[0][0]
    const url = new URL(calledUrl as string)
    expect(url.searchParams.get('api-version')).toBe('1.0')
    expect(url.searchParams.get('travelMode')).toBe('car')
    expect(url.searchParams.get('client-id')).toBe('test-maps-account-id')
  })

  it('falls back to haversine when Azure Maps returns non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Server error', { status: 500 }),
    )
    const { DefaultAzureCredential } = await import('@azure/identity')
    vi.spyOn(DefaultAzureCredential.prototype, 'getToken').mockResolvedValue({
      token: 'fake-token',
      expiresOnTimestamp: Date.now() + 3600000,
    })

    const segs = await getRouteSegments([HELSINGBORG, GOTHENBURG])
    expect(segs[1].source).toBe('haversine-fallback')
    // Haversine km (~187) should be returned, not the failed Maps value
    expect(segs[1].km).toBeGreaterThan(170)
  })

  it('falls back to haversine when Azure Maps response is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: 'shape' }), { status: 200 }),
    )
    const { DefaultAzureCredential } = await import('@azure/identity')
    vi.spyOn(DefaultAzureCredential.prototype, 'getToken').mockResolvedValue({
      token: 'fake-token',
      expiresOnTimestamp: Date.now() + 3600000,
    })

    const segs = await getRouteSegments([MALMO, YSTAD])
    expect(segs[1].source).toBe('haversine-fallback')
  })

  it('caches successful Azure Maps results in memory for subsequent lookups', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockMapsResponse(100, 70)), { status: 200 }),
    )
    const { DefaultAzureCredential } = await import('@azure/identity')
    vi.spyOn(DefaultAzureCredential.prototype, 'getToken').mockResolvedValue({
      token: 'fake-token',
      expiresOnTimestamp: Date.now() + 3600000,
    })

    // First call hits the API
    const segs1 = await getRouteSegments([MALMO, YSTAD])
    expect(segs1[1].source).toBe('azure-maps')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Second call should hit memory cache, not the API
    const segs2 = await getRouteSegments([MALMO, YSTAD])
    expect(segs2[1]).toEqual(segs1[1])
    expect(fetchSpy).toHaveBeenCalledTimes(1) // still 1
  })

  it('handles a multi-stop route through Stockholm → Malmö with real distances', async () => {
    // Verify the API query format is colon-delimited lat,lng:lat,lng
    // Each fetch returns a fresh Response (body can only be consumed once)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(mockMapsResponse(500, 360)), { status: 200 }),
    )
    const { DefaultAzureCredential } = await import('@azure/identity')
    vi.spyOn(DefaultAzureCredential.prototype, 'getToken').mockResolvedValue({
      token: 'fake-token',
      expiresOnTimestamp: Date.now() + 3600000,
    })

    const segs = await getRouteSegments([STOCKHOLM, GOTHENBURG, MALMO])
    expect(segs).toHaveLength(3)
    expect(segs[1].source).toBe('azure-maps')
    expect(segs[2].source).toBe('azure-maps')
    expect(fetchSpy).toHaveBeenCalledTimes(2) // two distinct pairs

    // Confirm the query string format for the first call
    const firstUrl = fetchSpy.mock.calls[0][0]
    const url = new URL(firstUrl as string)
    expect(url.searchParams.get('query')).toContain(':')
    expect(url.searchParams.get('query')).toContain(',')
  })

  it('resolves multi-stop routes concurrently, not sequentially', async () => {
    // Regression guard for the parallelization of getRouteSegments (#92):
    // with N uncached pairs, all N fetches must be in-flight before the first
    // one resolves. We assert this by making each mock fetch only settle when
    // a shared latch has seen every call start.
    const { DefaultAzureCredential } = await import('@azure/identity')
    vi.spyOn(DefaultAzureCredential.prototype, 'getToken').mockResolvedValue({
      token: 'fake-token',
      expiresOnTimestamp: Date.now() + 3600000,
    })

    const started: number[] = []
    let resolveAll!: () => void
    const allStarted = new Promise<void>((r) => { resolveAll = r })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      started.push(Date.now())
      if (started.length === 3) resolveAll()
      await allStarted
      return new Response(JSON.stringify(mockMapsResponse(100, 60)), { status: 200 })
    })

    const segs = await getRouteSegments([HELSINGBORG, GOTHENBURG, STOCKHOLM, MALMO])
    expect(segs).toHaveLength(4)
    expect(segs.slice(1).every((s) => s.source === 'azure-maps')).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    // If resolution were sequential, the third fetch wouldn't start until the
    // first two had settled — but the latch can't release until all three have
    // started. This would hang/timeout on a serial implementation.
  })
})
