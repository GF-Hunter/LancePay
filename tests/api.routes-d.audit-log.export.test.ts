import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindFirst = vi.fn()
const auditEventFindMany = vi.fn()
const auditEventCount = vi.fn()
const loggerError = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/logger', () => ({ logger: { error: loggerError } }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findFirst: invoiceFindFirst },
    auditEvent: { findMany: auditEventFindMany, count: auditEventCount },
  },
}))

const BASE_URL = 'http://localhost/api/routes-d/audit-log/export'

function makeRequest(params: Record<string, string> = {}, token: string | null = 'Bearer token') {
  const url = new URL(BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(url.toString(), { headers })
}

const SAMPLE_EVENT = {
  id: 'evt_1',
  invoiceId: 'inv_1',
  eventType: 'invoice.viewed',
  actorId: 'user_1',
  metadata: { ip: '1.2.3.4' },
  signature: 'abc123',
  createdAt: new Date('2026-06-01T10:00:00Z'),
}

describe('GET /api/routes-d/audit-log/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditEventFindMany.mockResolvedValue([])
    auditEventCount.mockResolvedValue(0)
  })

  // ── Auth ────────────────────────────────────────────────────────────────

  it('returns 401 when no authorization header is provided', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest({}, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
    expect(auditEventFindMany).not.toHaveBeenCalled()
  })

  it('returns 401 when the token is invalid', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  // ── Date validation ─────────────────────────────────────────────────────

  it('returns 400 for an invalid from date', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest({ from: 'not-a-date' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from must be a valid ISO 8601 date/)
    expect(auditEventFindMany).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid to date', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest({ to: 'bad-date' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/to must be a valid ISO 8601 date/)
  })

  it('returns 400 when from is later than to', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest({ from: '2026-07-01', to: '2026-06-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from must not be later than to/)
  })

  // ── invoiceId ownership check ───────────────────────────────────────────

  it('returns 404 when invoiceId does not belong to the user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    invoiceFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest({ invoiceId: 'inv_other' }))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Invoice not found')
    expect(auditEventFindMany).not.toHaveBeenCalled()
  })

  it('verifies invoiceId ownership with correct user scope', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    await GET(makeRequest({ invoiceId: 'inv_1' }))
    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv_1', userId: 'user_1' },
      }),
    )
  })

  // ── Happy path — empty results ──────────────────────────────────────────

  it('returns 200 with empty events and pagination when no events exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toEqual([])
    expect(json.pagination.total).toBe(0)
    expect(json.pagination.page).toBe(1)
    expect(json.pagination.limit).toBe(100)
    expect(json.pagination.totalPages).toBe(0)
  })

  // ── Happy path — with events ────────────────────────────────────────────

  it('returns events with all required fields', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    auditEventFindMany.mockResolvedValue([SAMPLE_EVENT])
    auditEventCount.mockResolvedValue(1)
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toHaveLength(1)
    const evt = json.events[0]
    expect(evt.id).toBe('evt_1')
    expect(evt.invoiceId).toBe('inv_1')
    expect(evt.eventType).toBe('invoice.viewed')
    expect(evt.actorId).toBe('user_1')
    expect(evt.signature).toBe('abc123')
    expect(evt.createdAt).toBeDefined()
  })

  it('scopes the query to the authenticated user via invoice relation', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    await GET(makeRequest())
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoice: { userId: 'user_1' },
        }),
      }),
    )
  })

  // ── Filters ─────────────────────────────────────────────────────────────

  it('applies eventType filter when provided', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    await GET(makeRequest({ eventType: 'invoice.paid' }))
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: 'invoice.paid' }),
      }),
    )
  })

  it('applies invoiceId filter when provided and owned', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    await GET(makeRequest({ invoiceId: 'inv_1' }))
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invoiceId: 'inv_1' }),
      }),
    )
  })

  it('applies from/to date range to the createdAt filter', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    await GET(makeRequest({ from: '2026-01-01', to: '2026-06-30' }))
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: new Date('2026-01-01'),
          }),
        }),
      }),
    )
  })

  // ── Pagination ──────────────────────────────────────────────────────────

  it('respects page and limit query params', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    auditEventCount.mockResolvedValue(50)
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest({ page: '3', limit: '10' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pagination.page).toBe(3)
    expect(json.pagination.limit).toBe(10)
    expect(json.pagination.totalPages).toBe(5)
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    )
  })

  it('clamps limit to the maximum of 500', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    await GET(makeRequest({ limit: '9999' }))
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    )
  })

  it('orders results by createdAt descending', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    await GET(makeRequest())
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    )
  })

  // ── Error handling ──────────────────────────────────────────────────────

  it('returns 500 on an unexpected database error', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockRejectedValue(new Error('DB crash'))
    const { GET } = await import('@/app/api/routes-d/audit-log/export/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to export audit log')
    expect(loggerError).toHaveBeenCalled()
  })
})
