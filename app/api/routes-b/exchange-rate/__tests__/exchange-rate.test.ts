import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '../route'

describe('GET /api/routes-b/exchange-rate', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.resetAllMocks()
    // Reset the module-level cache between tests by reimporting fresh
    vi.resetModules()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns USDC to NGN rate on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { NGN: 1650.5 } }),
    } as never)

    const { GET: handler } = await import('../route')
    const res = await handler()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rate.from).toBe('USDC')
    expect(body.rate.to).toBe('NGN')
    expect(body.rate.value).toBe(1650.5)
    expect(body.rate.source).toBe('open.er-api.com')
    expect(body.rate.fetchedAt).toBeDefined()
  })

  it('returns 503 when upstream fails and no cache', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { GET: handler } = await import('../route')
    const res = await handler()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(body.code).toBe('RATE_UNAVAILABLE')
  })

  it('returns 503 when upstream returns non-ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as never)

    const { GET: handler } = await import('../route')
    const res = await handler()
    expect(res.status).toBe(503)
  })

  it('returns 503 when rate field is missing from response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: {} }),
    } as never)

    const { GET: handler } = await import('../route')
    const res = await handler()
    expect(res.status).toBe(503)
  })
})
