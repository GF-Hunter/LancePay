import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const findUnique = vi.fn()
const statusFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    networkStatusSnapshot: { findMany: statusFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/networks/status'
const NOW = new Date('2026-07-27T12:00:00Z')

function makeRequest(url = BASE_URL, withAuth = true) {
  return new NextRequest(url, {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

function authOk() {
  verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
  findUnique.mockResolvedValue({ id: 'user_1' })
}

function snap(network: string, status: string, minutesAgo: number, latencyMs = 150) {
  return {
    network,
    status,
    latencyMs,
    message: null,
    capturedAt: new Date(NOW.getTime() - minutesAgo * 60 * 1000),
  }
}

describe('GET /api/routes-d/networks/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('returns 401 when no authorization header is present', async () => {
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const res = await GET(makeRequest(BASE_URL, false))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an unsupported network filter', async () => {
    authOk()
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const res = await GET(makeRequest(`${BASE_URL}?network=solana`))
    expect(res.status).toBe(400)
  })

  it('reports operational overall when all networks are healthy', async () => {
    authOk()
    statusFindMany.mockResolvedValue([snap('stellar', 'operational', 1), snap('bank', 'operational', 2)])
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.overall).toBe('operational')
    expect(json.networks).toHaveLength(2)
    expect(json.networks[0]).toMatchObject({ network: 'stellar', status: 'operational', latencyMs: 150 })
  })

  it('uses only the latest snapshot per network', async () => {
    authOk()
    statusFindMany.mockResolvedValue([
      snap('stellar', 'operational', 1),
      snap('stellar', 'down', 5), // older — must be ignored
      snap('bank', 'operational', 1),
    ])
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const json = await (await GET(makeRequest())).json()
    expect(json.overall).toBe('operational')
    expect(json.networks.find((n: { network: string }) => n.network === 'stellar').status).toBe('operational')
  })

  it('degrades overall when any network is degraded', async () => {
    authOk()
    statusFindMany.mockResolvedValue([snap('stellar', 'degraded', 1), snap('bank', 'operational', 1)])
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const json = await (await GET(makeRequest())).json()
    expect(json.overall).toBe('degraded')
  })

  it('reports down overall when any network is down', async () => {
    authOk()
    statusFindMany.mockResolvedValue([snap('stellar', 'down', 1), snap('bank', 'degraded', 1)])
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const json = await (await GET(makeRequest())).json()
    expect(json.overall).toBe('down')
  })

  it('marks stale snapshots as unknown', async () => {
    authOk()
    statusFindMany.mockResolvedValue([snap('stellar', 'operational', 15), snap('bank', 'operational', 1)])
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const json = await (await GET(makeRequest())).json()
    const stellar = json.networks.find((n: { network: string }) => n.network === 'stellar')
    expect(stellar.status).toBe('unknown')
    expect(stellar.message).toBe('Health data is stale')
  })

  it('reports unknown for a network with no snapshots', async () => {
    authOk()
    statusFindMany.mockResolvedValue([snap('stellar', 'operational', 1)])
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const json = await (await GET(makeRequest())).json()
    const bank = json.networks.find((n: { network: string }) => n.network === 'bank')
    expect(bank.status).toBe('unknown')
    expect(bank.message).toBe('No health data recorded')
  })

  it('filters to a single network when requested', async () => {
    authOk()
    statusFindMany.mockResolvedValue([snap('stellar', 'operational', 1)])
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const json = await (await GET(makeRequest(`${BASE_URL}?network=stellar`))).json()
    expect(json.networks).toHaveLength(1)
    expect(json.networks[0].network).toBe('stellar')
  })

  it('returns 500 when the query fails', async () => {
    authOk()
    statusFindMany.mockRejectedValue(new Error('db down'))
    const { GET } = await import('@/app/api/routes-d/networks/status/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
