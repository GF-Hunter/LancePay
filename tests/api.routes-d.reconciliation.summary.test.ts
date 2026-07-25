import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const transactionCount = vi.fn()
const invoiceCount = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    transaction: { count: transactionCount },
    invoice: { count: invoiceCount },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/reconciliation/summary'

function makeRequest(auth: string | null = 'Bearer token') {
  const headers: Record<string, string> = {}
  if (auth) headers.authorization = auth
  return new NextRequest(BASE_URL, { method: 'GET', headers })
}

describe('GET /api/routes-d/reconciliation/summary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no auth token is provided', async () => {
    const { GET } = await import('@/app/api/routes-d/reconciliation/summary/route')
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/reconciliation/summary/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/reconciliation/summary/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns reconciliation summary with zero counts when user has no transactions or invoices', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionCount.mockResolvedValue(0)
    invoiceCount.mockResolvedValue(0)
    const { GET } = await import('@/app/api/routes-d/reconciliation/summary/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.summary).toEqual({
      transactions: {
        total: 0,
        matched: 0,
        unmatched: 0,
        matchedPercentage: 0,
      },
      invoices: {
        total: 0,
        paid: 0,
        unpaid: 0,
        paidPercentage: 0,
      },
    })
  })

  it('calculates correct percentages when transactions are matched', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionCount.mockResolvedValueOnce(100)
    transactionCount.mockResolvedValueOnce(75)
    invoiceCount.mockResolvedValueOnce(50)
    invoiceCount.mockResolvedValueOnce(40)
    const { GET } = await import('@/app/api/routes-d/reconciliation/summary/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.summary).toEqual({
      transactions: {
        total: 100,
        matched: 75,
        unmatched: 25,
        matchedPercentage: 75,
      },
      invoices: {
        total: 50,
        paid: 40,
        unpaid: 10,
        paidPercentage: 80,
      },
    })
  })

  it('returns 500 when the database lookup fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionCount.mockRejectedValue(new Error('db error'))
    const { GET } = await import('@/app/api/routes-d/reconciliation/summary/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
