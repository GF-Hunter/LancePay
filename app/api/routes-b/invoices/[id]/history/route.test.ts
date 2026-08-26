import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    auditEvent: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

const params = Promise.resolve({ id: 'inv-1' })
const user = { id: 'user-1' }
const invoice = { id: 'inv-1' }

const events = [
  {
    id: 'evt-2',
    eventType: 'invoice.write_off',
    actorId: 'user-1',
    metadata: { reason: 'insolvent' },
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
  },
  {
    id: 'evt-1',
    eventType: 'invoice.created',
    actorId: 'user-1',
    metadata: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  },
]

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/routes-b/invoices/inv-1/history${query}`, {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: 'privy-1' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never)
  vi.mocked(prisma.invoice.findFirst).mockResolvedValue(invoice as never)
  vi.mocked(prisma.auditEvent.findMany).mockResolvedValue(events as never)
  vi.mocked(prisma.auditEvent.count).mockResolvedValue(events.length as never)
})

describe('GET /api/routes-b/invoices/[id]/history', () => {
  it('returns paginated history for an owned invoice', async () => {
    const res = await GET(makeRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.history).toHaveLength(2)
    expect(body.history[0].eventType).toBe('invoice.write_off')
    expect(body.pagination).toEqual({ page: 1, limit: 25, total: 2, totalPages: 1 })
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoiceId: 'inv-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 25,
      }),
    )
  })

  it('applies page and limit query params', async () => {
    await GET(makeRequest('?page=2&limit=10'), { params })
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    )
  })

  it('clamps an out-of-range limit to the maximum', async () => {
    await GET(makeRequest('?limit=500'), { params })
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
  })

  it('falls back to page 1 for an invalid page value', async () => {
    await GET(makeRequest('?page=-3'), { params })
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    )
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/routes-b/invoices/inv-1/history'),
      { params },
    )
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 500 and logs when a database call throws', async () => {
    vi.mocked(prisma.auditEvent.findMany).mockRejectedValue(new Error('db down'))
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(500)
  })
})
