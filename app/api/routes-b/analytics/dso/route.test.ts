import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindMany = prisma.invoice.findMany as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/analytics/dso'

const sampleInvoices = [
  { amount: 100, createdAt: new Date('2026-01-01T00:00:00Z'), paidAt: new Date('2026-01-11T00:00:00Z') },
  { amount: 300, createdAt: new Date('2026-01-01T00:00:00Z'), paidAt: new Date('2026-01-06T00:00:00Z') },
]

function makeReq(query = '', token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-user-123' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-123' })
  mockInvoiceFindMany.mockResolvedValue(sampleInvoices)
})

describe('GET /api/routes-b/analytics/dso', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeReq('', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user is not found', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(404)
  })

  it('returns 400 for a days parameter above the max', async () => {
    const res = await GET(makeReq('?days=9999'))
    expect(res.status).toBe(400)
  })

  it('scopes the invoice lookup to the authenticated user and only paid invoices', async () => {
    await GET(makeReq())
    expect(mockInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-123', status: 'paid' }),
      }),
    )
  })

  it('returns 200 with the amount-weighted DSO on the happy path', async () => {
    const res = await GET(makeReq('?days=90'))
    expect(res.status).toBe(200)
    const json = await res.json()
    // weighted: (10*100 + 5*300) / 400 = 6.25
    expect(json.metric.dso).toBe(6.25)
    expect(json.metric.invoicesConsidered).toBe(2)
  })

  it('returns zero DSO when there are no paid invoices', async () => {
    mockInvoiceFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.metric.dso).toBe(0)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceFindMany.mockRejectedValue(new Error('database unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch DSO metric')
  })
})
