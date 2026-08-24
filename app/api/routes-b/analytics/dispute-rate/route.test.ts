import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { count: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceCount = prisma.invoice.count as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/analytics/dispute-rate'

function makeReq(query = '', token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-user-123' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-123' })
  mockInvoiceCount.mockResolvedValueOnce(20).mockResolvedValueOnce(2)
})

describe('GET /api/routes-b/analytics/dispute-rate', () => {
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

  it('scopes invoice counts to the authenticated user (ownership check)', async () => {
    await GET(makeReq())
    expect(mockInvoiceCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-123' }) }),
    )
  })

  it('returns 200 with the dispute rate on the happy path', async () => {
    const res = await GET(makeReq('?days=30'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.metric.totalInvoices).toBe(20)
    expect(json.metric.disputedInvoices).toBe(2)
    expect(json.metric.disputeRate).toBe(0.1)
    expect(json.metric.disputeRatePercentage).toBe(10)
  })

  it('returns a zero rate when there are no invoices', async () => {
    mockInvoiceCount.mockReset()
    mockInvoiceCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.metric.disputeRate).toBe(0)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceCount.mockReset()
    mockInvoiceCount.mockRejectedValue(new Error('database unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch dispute rate metric')
  })
})
