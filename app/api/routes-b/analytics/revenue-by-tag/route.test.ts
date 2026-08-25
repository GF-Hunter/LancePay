import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoiceTag: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceTagFindMany = prisma.invoiceTag.findMany as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/analytics/revenue-by-tag'

const sampleInvoiceTags = [
  {
    tag: { id: 'tag-1', name: 'Design', color: '#111111' },
    invoice: { id: 'inv-1', amount: 100, status: 'paid' },
  },
  {
    tag: { id: 'tag-1', name: 'Design', color: '#111111' },
    invoice: { id: 'inv-2', amount: 50, status: 'pending' },
  },
  {
    tag: { id: 'tag-2', name: 'Consulting', color: '#222222' },
    invoice: { id: 'inv-3', amount: 200, status: 'paid' },
  },
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
  mockInvoiceTagFindMany.mockResolvedValue(sampleInvoiceTags)
})

describe('GET /api/routes-b/analytics/revenue-by-tag', () => {
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

  it('scopes the invoice tag lookup to the authenticated user (ownership check)', async () => {
    await GET(makeReq())
    expect(mockInvoiceTagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoice: expect.objectContaining({ userId: 'user-123' }),
        }),
      }),
    )
  })

  it('returns 200 with revenue aggregated by tag on the happy path', async () => {
    const res = await GET(makeReq('?days=30'))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.report.days).toBe(30)
    expect(json.report.tags).toHaveLength(2)

    const design = json.report.tags.find((t: { name: string }) => t.name === 'Design')
    expect(design.totalRevenue).toBe(150)
    expect(design.paidRevenue).toBe(100)
    expect(design.invoiceCount).toBe(2)

    const consulting = json.report.tags.find((t: { name: string }) => t.name === 'Consulting')
    expect(consulting.totalRevenue).toBe(200)
    expect(consulting.paidRevenue).toBe(200)
  })

  it('returns an empty list when there are no tagged invoices', async () => {
    mockInvoiceTagFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.report.tags).toEqual([])
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceTagFindMany.mockRejectedValue(new Error('database unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch revenue by tag report')
  })
})
