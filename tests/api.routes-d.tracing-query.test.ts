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

const BASE_URL = 'http://localhost/api/routes-d/tracing/query'

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

describe('GET /api/routes-d/tracing/query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when authorization header is missing', async () => {
    const { GET } = await import('@/app/api/routes-d/tracing/query/route')
    const res = await GET(makeRequest({}, ''))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user is not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue(null)

    const { GET } = await import('@/app/api/routes-d/tracing/query/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid limit or offset', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })

    const { GET } = await import('@/app/api/routes-d/tracing/query/route')
    const res = await GET(makeRequest({ limit: '-10' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with traces on valid request', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })

    const { GET } = await import('@/app/api/routes-d/tracing/query/route')
    const res = await GET(makeRequest({ limit: '20', offset: '0', service: 'api' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('traces')
    expect(body.limit).toBe(20)
    expect(body.offset).toBe(0)
  })
})
