import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({
  verifyAuthToken: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { groupBy: vi.fn() },
    transaction: { aggregate: vi.fn(), findMany: vi.fn() },
  },
}))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

const mockedVerify = vi.mocked(verifyAuthToken)
const mockedUserFind = vi.mocked(prisma.user.findUnique)
const mockedGroupBy = vi.mocked(prisma.invoice.groupBy)
const mockedAggregate = vi.mocked(prisma.transaction.aggregate)
const mockedFindMany = vi.mocked(prisma.transaction.findMany)

const fakeUser = { id: 'user-1', privyId: 'privy-1' }

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/routes-b/dashboard', {
    headers: { authorization: 'Bearer token' },
  })
}

describe('GET /api/routes-b/dashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    mockedUserFind.mockResolvedValue(fakeUser as never)
    mockedGroupBy.mockResolvedValue([
      { status: 'pending', _count: { id: 3 } },
      { status: 'paid', _count: { id: 10 } },
      { status: 'overdue', _count: { id: 2 } },
    ] as never)
    mockedAggregate
      .mockResolvedValueOnce({ _sum: { amount: 5000 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: 1200 } } as never)
    mockedFindMany.mockResolvedValue([
      { id: 'txn-1', type: 'payment', amount: 500, currency: 'USDC', createdAt: new Date() },
    ] as never)
  })

  it('returns 401 when no auth token', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 404 when user not found', async () => {
    mockedUserFind.mockResolvedValue(null as never)
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns dashboard summary with invoice counts', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary.invoices.pending).toBe(3)
    expect(body.summary.invoices.paid).toBe(10)
    expect(body.summary.invoices.overdue).toBe(2)
    expect(body.summary.invoices.cancelled).toBe(0)
    expect(body.summary.invoices.total).toBe(15)
  })

  it('returns earnings totals', async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.summary.earnings.totalEarned).toBe(5000)
    expect(body.summary.earnings.thisMonth).toBe(1200)
    expect(body.summary.earnings.currency).toBe('USDC')
  })

  it('returns recent transactions', async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(Array.isArray(body.summary.recentTransactions)).toBe(true)
    expect(body.summary.recentTransactions[0].id).toBe('txn-1')
  })

  it('handles null aggregate sums as zero', async () => {
    mockedAggregate
      .mockResolvedValueOnce({ _sum: { amount: null } } as never)
      .mockResolvedValueOnce({ _sum: { amount: null } } as never)
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.summary.earnings.totalEarned).toBe(0)
    expect(body.summary.earnings.thisMonth).toBe(0)
  })
})
