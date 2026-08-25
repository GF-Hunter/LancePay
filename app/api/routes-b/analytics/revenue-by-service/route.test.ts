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

const BASE_URL = 'http://localhost/api/routes-b/analytics/revenue-by-service'

const sampleInvoices = [
  { amount: 100, status: 'paid', description: 'Logo design' },
  { amount: 50, status: 'pending', description: 'Logo design' },
  { amount: 200, status: 'paid', description: 'Consulting' },
  { amount: 20, status: 'paid', description: '' },
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

describe('GET /api/routes-b/analytics/revenue-by-service', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeReq('', null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
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
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 400 for a non-integer days parameter', async () => {
    const res = await GET(makeReq('?days=abc'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a days parameter out of range', async () => {
    const res = await GET(makeReq('?days=0'))
    expect(res.status).toBe(400)
  })

  it('scopes the invoice lookup to the authenticated user (ownership check)', async () => {
    await GET(makeReq())
    expect(mockInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-123' }) }),
    )
  })

  it('returns 200 with revenue aggregated by service description on the happy path', async () => {
    const res = await GET(makeReq('?days=30'))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.report.days).toBe(30)

    const logo = json.report.services.find((s: { service: string }) => s.service === 'Logo design')
    expect(logo.totalRevenue).toBe(150)
    expect(logo.paidRevenue).toBe(100)
    expect(logo.invoiceCount).toBe(2)

    const uncategorized = json.report.services.find(
      (s: { service: string }) => s.service === 'Uncategorized',
    )
    expect(uncategorized.totalRevenue).toBe(20)
  })

  it('returns an empty list when there are no invoices', async () => {
    mockInvoiceFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.report.services).toEqual([])
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceFindMany.mockRejectedValue(new Error('database unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch revenue by service report')
  })
})
