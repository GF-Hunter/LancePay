import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

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

const BASE_URL = 'http://localhost/api/routes-b/invoices/summaries/yearly'

const sampleInvoices = [
  { amount: 100, currency: 'USD', status: 'paid', createdAt: new Date(Date.UTC(2025, 0, 15)) },
  { amount: 250, currency: 'USD', status: 'pending', createdAt: new Date(Date.UTC(2025, 5, 3)) },
  { amount: 50, currency: 'EUR', status: 'paid', createdAt: new Date(Date.UTC(2025, 11, 20)) },
]

function makeGetReq(query = '', token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

function makePostReq(body: unknown, token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-user-123' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-123' })
  mockInvoiceFindMany.mockResolvedValue(sampleInvoices)
})

describe('GET /api/routes-b/invoices/summaries/yearly', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGetReq('', null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq('?year=2025'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user is not found', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await GET(makeGetReq('?year=2025'))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 400 for a malformed year', async () => {
    const res = await GET(makeGetReq('?year=abcd'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/4-digit number/i)
  })

  it('returns 400 for a year outside the supported range', async () => {
    const res = await GET(makeGetReq('?year=1899'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/year must be between/i)
  })

  it('scopes the invoice lookup to the authenticated user (ownership check)', async () => {
    await GET(makeGetReq('?year=2025'))
    expect(mockInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-123' }),
      }),
    )
  })

  it('returns 200 with an aggregated summary on the happy path', async () => {
    const res = await GET(makeGetReq('?year=2025'))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.summary.year).toBe(2025)
    expect(json.summary.totalInvoices).toBe(3)
    expect(json.summary.totalAmount).toBe(400)
    expect(json.summary.byStatus.paid).toEqual({ count: 2, amount: 150 })
    expect(json.summary.byStatus.pending).toEqual({ count: 1, amount: 250 })
    expect(json.summary.byCurrency.USD).toEqual({ count: 2, amount: 350 })
    expect(json.summary.monthlyBreakdown).toHaveLength(12)
    expect(json.summary.monthlyBreakdown[0]).toEqual({ month: 1, count: 1, amount: 100 })
  })

  it('defaults to the current year when no year query param is provided', async () => {
    const res = await GET(makeGetReq(''))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.summary.year).toBe(new Date().getUTCFullYear())
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceFindMany.mockRejectedValue(new Error('database unavailable'))
    const res = await GET(makeGetReq('?year=2025'))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch yearly invoice summary')
  })
})

describe('POST /api/routes-b/invoices/summaries/yearly', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(makePostReq({ year: 2025 }, null))
    expect(res.status).toBe(401)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await POST(makePostReq('not-json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 for an invalid year in the body', async () => {
    const res = await POST(makePostReq({ year: 'not-a-year' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with a summary computed for the requested year', async () => {
    const res = await POST(makePostReq({ year: 2025 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.summary.year).toBe(2025)
    expect(json.summary.totalInvoices).toBe(3)
  })

  it('defaults to the current year when the body omits year', async () => {
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.summary.year).toBe(new Date().getUTCFullYear())
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceFindMany.mockRejectedValue(new Error('database unavailable'))
    const res = await POST(makePostReq({ year: 2025 }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to generate yearly invoice summary')
  })
})
