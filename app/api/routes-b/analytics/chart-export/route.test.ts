import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

function makeRequest(params: Record<string, string> = {}, headers: Record<string, string> = { authorization: 'Bearer token' }) {
  const url = new URL('http://localhost/api/routes-b/analytics/chart-export')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.transaction.findMany).mockResolvedValue([
    { amount: '100.00', currency: 'USDC', createdAt: new Date('2026-03-15T00:00:00Z') },
    { amount: '50.00', currency: 'USDC', createdAt: new Date('2026-03-20T00:00:00Z') },
  ] as never)
})

describe('GET /api/routes-b/analytics/chart-export', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const res = await GET(makeRequest({}, {}))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid period', async () => {
    const res = await GET(makeRequest({ period: 'yearly' }))
    expect(res.status).toBe(400)
  })

  it('returns an SVG image for a valid request', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    const body = await res.text()
    expect(body).toContain('<svg')
    expect(body).toContain('2026-03')
  })

  it('defaults to monthly period when none is provided', async () => {
    const res = await GET(makeRequest())
    const body = await res.text()
    expect(body).toContain('2026-03')
  })

  it('accepts a daily period', async () => {
    const res = await GET(makeRequest({ period: 'daily' }))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('2026-03-15')
  })

  it('returns an empty chart when there are no transactions', async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<svg')
  })

  it('queries only completed payment transactions', async () => {
    await GET(makeRequest())
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', type: 'payment', status: 'completed' }),
      }),
    )
  })
})
