import { describe, it, expect, beforeAll, vi } from 'vitest'

// ALLOWED_ORIGINS is read once at module load, so control it via env + a fresh
// dynamic import (vi.resetModules) before the helpers are imported.
describe('cors helpers', () => {
  let cors!: typeof import('./cors')

  beforeAll(async () => {
    vi.resetModules()
    process.env.ALLOWED_ORIGINS = 'https://allowed.example,http://localhost:5173'
    cors = await import('./cors')
  })

  const acao = (res: { headers?: Record<string, string> }): string | undefined =>
    (res.headers as Record<string, string> | undefined)?.['Access-Control-Allow-Origin']

  it('withCors echoes a recognized origin as ACAO', () => {
    const res = cors.withCors({ status: 200 }, 'https://allowed.example')
    expect(acao(res)).toBe('https://allowed.example')
  })

  it('withCors omits ACAO entirely for an unrecognized origin', () => {
    const res = cors.withCors({ status: 200 }, 'https://evil.example')
    expect(acao(res)).toBeUndefined()
  })

  it('corsPreflightResponse returns 204 and echoes a recognized origin', () => {
    const res = cors.corsPreflightResponse('https://allowed.example')
    expect(res.status).toBe(204)
    expect(acao(res)).toBe('https://allowed.example')
  })

  it('corsPreflightResponse omits ACAO for an unrecognized origin', () => {
    const res = cors.corsPreflightResponse('https://evil.example')
    expect(res.status).toBe(204)
    expect(acao(res)).toBeUndefined()
  })

  it('security headers are present regardless of origin', () => {
    const res = cors.withCors({ status: 200 }, 'https://evil.example')
    const h = res.headers as Record<string, string>
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
  })
})
