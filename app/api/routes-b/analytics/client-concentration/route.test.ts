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

const BASE_URL = 'http://localhost/api/routes-b/analytics/client-concentration'

const sampleInvoices = [
  { amount: 800, clientEmail: 'big@client.com', clientName: 'Big Client' },
  { amount: 100, clientEmail: 'small1@client.com', clientName: 'Small One' },
  { amount: 100, clientEmail: 'small2@client.com', clientName: 'Small Two' },
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

describe('GET /api/routes-b/analytics/client-concentration', () => {
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

  it('scopes the invoice lookup to the authenticated user and paid status (ownership check)', async () => {
    await GET(makeReq())
    expect(mockInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-123', status: 'paid' }),
      }),
    )
  })

  it('returns 200 with concentration metrics on the happy path', async () => {
    const res = await GET(makeReq('?days=30'))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.report.days).toBe(30)
    expect(json.report.totalRevenue).toBe(1000)
    expect(json.report.totalClients).toBe(3)
    expect(json.report.topClientRevenueShare).toBe(0.8)
    expect(json.report.clients[0].clientEmail).toBe('big@client.com')
    expect(json.report.clients[0].revenueShare).toBe(0.8)
    expect(json.report.herfindahlIndex).toBeCloseTo(0.66, 2)
  })

  it('returns zeroed metrics when there is no paid revenue', async () => {
    mockInvoiceFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.report.totalRevenue).toBe(0)
    expect(json.report.herfindahlIndex).toBe(0)
    expect(json.report.topClientRevenueShare).toBe(0)
    expect(json.report.clients).toEqual([])
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceFindMany.mockRejectedValue(new Error('database unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch client concentration report')
  })
})
