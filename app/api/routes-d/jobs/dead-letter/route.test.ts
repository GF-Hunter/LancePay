import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    webhookDelivery: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const db = prisma as unknown as {
  webhookDelivery: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
}

const BASE_URL = 'http://localhost/api/routes-d/jobs/dead-letter'

function makeReq(url = BASE_URL, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(url, { method: 'GET', headers })
}

describe('GET /api/routes-d/jobs/dead-letter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockResolvedValue({ userId: 'privy-user-123' })
    mockUserFindUnique.mockResolvedValue({ id: 'user-123', role: 'freelancer' })
    db.webhookDelivery.findMany.mockResolvedValue([])
    db.webhookDelivery.count.mockResolvedValue(0)
  })

  it('returns 401 when no authorization token is provided', async () => {
    const res = await GET(makeReq(BASE_URL, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when token verification fails', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when user is not found in database', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 400 when invalid limit is supplied', async () => {
    const res = await GET(makeReq(`${BASE_URL}?limit=invalid`))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/limit/i)
  })

  it('returns 400 when limit is out of range', async () => {
    const res = await GET(makeReq(`${BASE_URL}?limit=150`))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/limit/i)
  })

  it('returns 400 when page is non-positive', async () => {
    const res = await GET(makeReq(`${BASE_URL}?page=0`))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/page/i)
  })

  it('returns 200 with dead-letter jobs list on success', async () => {
    const mockJobs = [
      {
        id: 'delivery-1',
        webhookId: 'webhook-1',
        eventType: 'invoice.paid',
        payload: '{"invoiceId":"inv-1"}',
        status: 'dead',
        attemptCount: 5,
        lastAttemptAt: new Date('2026-07-26T12:00:00Z'),
        lastStatusCode: 500,
        lastError: 'Target endpoint non-responsive',
        createdAt: new Date('2026-07-26T10:00:00Z'),
      },
    ]
    db.webhookDelivery.findMany.mockResolvedValue(mockJobs)
    db.webhookDelivery.count.mockResolvedValue(1)

    const res = await GET(makeReq(`${BASE_URL}?limit=10&page=1`))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.jobs).toHaveLength(1)
    expect(json.jobs[0].id).toBe('delivery-1')
    expect(json.jobs[0].queue).toBe('webhooks')
    expect(json.jobs[0].status).toBe('dead')
    expect(json.total).toBe(1)
    expect(json.page).toBe(1)
    expect(json.limit).toBe(10)
  })

  it('returns 500 on database unexpected error', async () => {
    db.webhookDelivery.findMany.mockRejectedValue(new Error('DB failure'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch dead-letter jobs')
  })
})
