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

const BASE_URL = 'http://localhost/api/routes-b/analytics/top-months'

function makeReq(query = '', token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

const samplePaidInvoices = [
  { amount: 100, paidAt: new Date(Date.UTC(2025, 0, 15)), createdAt: new Date(Date.UTC(2025, 0, 10)) },
  { amount: 250, paidAt: new Date(Date.UTC(2025, 0, 20)), createdAt: new Date(Date.UTC(2025, 0, 18)) },
  { amount: 500, paidAt: new Date(Date.UTC(2025, 5, 3)), createdAt: new Date(Date.UTC(2025, 5, 1)) },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockInvoiceFindMany.mockResolvedValue(samplePaidInvoices)
})

describe('GET /api/routes-b/analytics/top-months', () => {
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

  it('returns 400 for an invalid limit parameter', async () => {
    const res = await GET(makeReq('?limit=abc'))
    expect(res.status).toBe(400)
  })

  it('scopes the invoice lookup to the authenticated, paid-only invoices', async () => {
    await GET(makeReq())
    expect(mockInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: 'paid' },
      }),
    )
  })

  it('returns 200 with months aggregated and ranked by totalAmount', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.topMonths[0]).toEqual({
      year: 2025,
      month: 6,
      monthName: 'June',
      totalAmount: 500,
      invoiceCount: 1,
    })
    expect(json.topMonths[1].totalAmount).toBe(350)
  })

  it('respects the limit query param', async () => {
    const res = await GET(makeReq('?limit=1'))
    const json = await res.json()
    expect(json.topMonths).toHaveLength(1)
  })

  it('returns an empty list when there are no paid invoices', async () => {
    mockInvoiceFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.topMonths).toEqual([])
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceFindMany.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch top earning months')
  })
})
