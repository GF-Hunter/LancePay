import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindFirst = vi.fn()
const auditEventFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findFirst: invoiceFindFirst },
    auditEvent: { findMany: auditEventFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/invoices/inv-1/timeline'

function req(token: string | null = 'tok') {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL, { method: 'GET', headers: h })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const SAMPLE_EVENTS = [
  { id: 'evt-1', eventType: 'created', actorId: 'user-1', metadata: null, createdAt: new Date('2026-01-01') },
  { id: 'evt-2', eventType: 'sent', actorId: 'user-1', metadata: { via: 'email' }, createdAt: new Date('2026-01-02') },
]

describe('GET /api/routes-b/invoices/[id]/timeline', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/timeline/route')
    const res = await GET(req(), ctx('inv-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found or not owned', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/timeline/route')
    const res = await GET(req(), ctx('inv-1'))
    expect(res.status).toBe(404)
  })

  it('returns timeline events in chronological order', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    auditEventFindMany.mockResolvedValue(SAMPLE_EVENTS)

    const { GET } = await import('@/app/api/routes-b/invoices/[id]/timeline/route')
    const res = await GET(req(), ctx('inv-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toHaveLength(2)
    expect(json.events[0].eventType).toBe('created')
    expect(json.events[1].eventType).toBe('sent')
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: 'inv-1' }, orderBy: { createdAt: 'asc' } }),
    )
  })

  it('returns an empty list for an invoice with no events', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    auditEventFindMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/routes-b/invoices/[id]/timeline/route')
    const res = await GET(req(), ctx('inv-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).events).toEqual([])
  })
})
