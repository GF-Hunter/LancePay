import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    auditEvent: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>
const mockEventFindMany = prisma.auditEvent.findMany as unknown as ReturnType<typeof vi.fn>
const mockEventCount = prisma.auditEvent.count as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/audit-log'

function makeReq(query = '', token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockEventFindMany.mockResolvedValue([
    { id: 'evt-1', invoiceId: 'inv-1', eventType: 'invoice.paid', actorId: 'user-1', metadata: null, createdAt: new Date() },
  ])
  mockEventCount.mockResolvedValue(1)
})

describe('GET /api/routes-b/audit-log', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeReq('', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 401 when the user is not found', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 200 with paginated events on the happy path', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toHaveLength(1)
    expect(json.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 })
  })

  it('scopes the query to the authenticated user (ownership check)', async () => {
    await GET(makeReq())
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invoice: { userId: 'user-1' } }),
      }),
    )
  })

  it('returns 404 when invoiceId does not belong to the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await GET(makeReq('?invoiceId=inv-x'))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Invoice not found')
  })

  it('filters by invoiceId when it belongs to the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue({ id: 'inv-1' })
    const res = await GET(makeReq('?invoiceId=inv-1'))
    expect(res.status).toBe(200)
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invoiceId: 'inv-1' }),
      }),
    )
  })

  it('clamps limit to the maximum allowed', async () => {
    const res = await GET(makeReq('?limit=9999'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pagination.limit).toBe(100)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockEventFindMany.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch audit log')
  })
})
