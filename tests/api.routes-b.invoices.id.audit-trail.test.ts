import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindFirst = vi.fn()
const auditEventFindMany = vi.fn()
const auditEventCount = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findFirst: invoiceFindFirst },
    auditEvent: {
      findMany: auditEventFindMany,
      count: auditEventCount,
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/invoices/inv-1/audit-trail'

function req(token: string | null = 'tok', query = '') {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(`${URL}${query}`, { method: 'GET', headers: h })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const SAMPLE_EVENTS = [
  { id: 'evt-2', invoiceId: 'inv-1', eventType: 'sent', actorId: 'user-1', metadata: { via: 'email' }, createdAt: new Date('2026-01-02') },
  { id: 'evt-1', invoiceId: 'inv-1', eventType: 'created', actorId: 'user-1', metadata: null, createdAt: new Date('2026-01-01') },
]

describe('GET /api/routes-b/invoices/[id]/audit-trail (#1124)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/audit-trail/route')
    const res = await GET(req(null), ctx('inv-1'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/audit-trail/route')
    const res = await GET(req('invalid'), ctx('inv-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user is not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/audit-trail/route')
    const res = await GET(req(), ctx('inv-1'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when invoice not found or not owned', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/audit-trail/route')
    const res = await GET(req(), ctx('inv-1'))
    expect(res.status).toBe(404)
  })

  it('returns audit trail entries for the invoice', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    auditEventFindMany.mockResolvedValue(SAMPLE_EVENTS)
    auditEventCount.mockResolvedValue(2)

    const { GET } = await import('@/app/api/routes-b/invoices/[id]/audit-trail/route')
    const res = await GET(req(), ctx('inv-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.auditTrail).toHaveLength(2)
    expect(json.events).toHaveLength(2)
    expect(json.pagination.total).toBe(2)
    expect(json.pagination.page).toBe(1)
  })

  it('supports filtering by eventType and pagination', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    auditEventFindMany.mockResolvedValue([SAMPLE_EVENTS[0]])
    auditEventCount.mockResolvedValue(1)

    const { GET } = await import('@/app/api/routes-b/invoices/[id]/audit-trail/route')
    const res = await GET(req('tok', '?eventType=sent&page=1&limit=10'), ctx('inv-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.auditTrail).toHaveLength(1)
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoiceId: 'inv-1', eventType: 'sent' },
        skip: 0,
        take: 10,
      }),
    )
  })

  it('handles errors gracefully with 500 status', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockRejectedValue(new Error('DB failure'))

    const { GET } = await import('@/app/api/routes-b/invoices/[id]/audit-trail/route')
    const res = await GET(req(), ctx('inv-1'))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch invoice audit trail')
  })
})
