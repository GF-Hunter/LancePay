import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
  },
}))

const BASE_URL = 'http://localhost/api/routes-d/admin/queue-metrics'

function makeRequest(queryParams: Record<string, string> = {}, authHeader: string = 'Bearer token') {
  const url = new URL(BASE_URL)
  Object.entries(queryParams).forEach(([k, v]) => url.searchParams.append(k, v))

  const headers: Record<string, string> = {}
  if (authHeader) {
    headers.authorization = authHeader
  }

  return new NextRequest(url.toString(), {
    method: 'GET',
    headers,
  })
}

describe('GET /api/routes-d/admin/queue-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when authorization header is missing', async () => {
    const { GET } = await import('@/app/api/routes-d/admin/queue-metrics/route')
    const res = await GET(makeRequest({}, ''))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not an admin', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', role: 'freelancer' })

    const { GET } = await import('@/app/api/routes-d/admin/queue-metrics/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  it('returns 404 when user profile is not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue(null)

    const { GET } = await import('@/app/api/routes-d/admin/queue-metrics/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 200 with queue metrics for valid admin request', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-admin' })
    userFindUnique.mockResolvedValue({ id: 'admin-1', role: 'admin' })

    const { GET } = await import('@/app/api/routes-d/admin/queue-metrics/route')
    const res = await GET(makeRequest({ queueName: 'webhooks' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.queueName).toBe('webhooks')
    expect(body.metrics).toBeDefined()
    expect(body.metrics.active).toBe(0)
  })
})
