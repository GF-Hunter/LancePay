import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    webhookDelivery: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockAdmin = { id: 'user-1', role: 'admin', email: 'admin@test.com' }
const mockUser = { id: 'user-2', role: 'user', email: 'user@test.com' }
const mockClaims = { userId: 'privy-1' }

const mockDeliveries = [
  {
    id: 'del-1',
    webhookId: 'wh-1',
    status: 'success',
    createdAt: new Date(),
    webhook: { targetUrl: 'https://example.com/hook', eventTypes: ['payment.completed'] },
  },
]

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/routes-d/admin/webhooks/debugger')
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  return new NextRequest(url.toString(), {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockAdmin as any)
  vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValue(mockDeliveries as any)
})

describe('GET /api/routes-d/admin/webhooks/debugger', () => {
  it('returns deliveries for admin', async () => {
    const res = await GET(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.deliveries).toHaveLength(1)
    expect(data.count).toBe(1)
    expect(data.filters.webhookId).toBeNull()
  })

  it('filters by webhookId when provided', async () => {
    const res = await GET(makeRequest({ webhookId: 'wh-1' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.filters.webhookId).toBe('wh-1')
    expect(vi.mocked(prisma.webhookDelivery.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { webhookId: 'wh-1' } }),
    )
  })

  it('caps limit at 100', async () => {
    const res = await GET(makeRequest({ limit: '999' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.filters.limit).toBe(100)
    expect(vi.mocked(prisma.webhookDelivery.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
  })

  it('returns 401 when no token', async () => {
    const res = await GET(new NextRequest('http://localhost/api/routes-d/admin/webhooks/debugger'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when token invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  it('returns 500 on unexpected error', async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockRejectedValue(new Error('DB error'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
