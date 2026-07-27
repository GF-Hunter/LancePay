import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const findUnique = vi.fn()
const snapshotFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    onchainFeeSnapshot: { findMany: snapshotFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/onchain/fee-history'

function makeRequest(url = BASE_URL, withAuth = true) {
  return new NextRequest(url, {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

const SNAPSHOTS = [
  {
    id: 's1',
    network: 'stellar',
    avgFeeStroops: 100,
    minFeeStroops: 100,
    maxFeeStroops: 200,
    ledgerCloseTimeMs: 5000,
    capturedAt: new Date('2026-07-25T00:00:00Z'),
  },
  {
    id: 's2',
    network: 'stellar',
    avgFeeStroops: 300,
    minFeeStroops: 100,
    maxFeeStroops: 1000,
    ledgerCloseTimeMs: 5100,
    capturedAt: new Date('2026-07-26T00:00:00Z'),
  },
]

function authOk() {
  verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
  findUnique.mockResolvedValue({ id: 'user_1' })
}

describe('GET /api/routes-d/onchain/fee-history', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no authorization header is present', async () => {
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    const res = await GET(makeRequest(BASE_URL, false))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 400 for an unsupported network', async () => {
    authOk()
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    const res = await GET(makeRequest(`${BASE_URL}?network=ethereum`))
    expect(res.status).toBe(400)
  })

  it.each(['0', '91', 'abc'])('returns 400 for invalid days=%s', async (days) => {
    authOk()
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    const res = await GET(makeRequest(`${BASE_URL}?days=${days}`))
    expect(res.status).toBe(400)
  })

  it('returns history with summary aggregates', async () => {
    authOk()
    snapshotFindMany.mockResolvedValue(SNAPSHOTS)
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.network).toBe('stellar')
    expect(json.days).toBe(7)
    expect(json.summary).toEqual({
      sampleCount: 2,
      avgFeeStroops: 200,
      peakFeeStroops: 1000,
    })
    expect(json.history).toHaveLength(2)
  })

  it('scopes the query to the requested window and network', async () => {
    authOk()
    snapshotFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    await GET(makeRequest(`${BASE_URL}?days=30`))
    const call = snapshotFindMany.mock.calls[0][0]
    expect(call.where.network).toBe('stellar')
    const since = call.where.capturedAt.gte.getTime()
    expect(Date.now() - since).toBeGreaterThan(29 * 24 * 60 * 60 * 1000)
    expect(Date.now() - since).toBeLessThan(31 * 24 * 60 * 60 * 1000)
  })

  it('returns null aggregates for an empty window', async () => {
    authOk()
    snapshotFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.summary).toEqual({
      sampleCount: 0,
      avgFeeStroops: null,
      peakFeeStroops: null,
    })
    expect(json.history).toEqual([])
  })

  it('returns 500 when the query fails', async () => {
    authOk()
    snapshotFindMany.mockRejectedValue(new Error('db down'))
    const { GET } = await import('@/app/api/routes-d/onchain/fee-history/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
