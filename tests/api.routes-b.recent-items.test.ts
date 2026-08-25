import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindMany = vi.fn()
const transactionFindMany = vi.fn()
const expenseFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findMany: invoiceFindMany },
    transaction: { findMany: transactionFindMany },
    expense: { findMany: expenseFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/recent-items'

function req(token: string | null = 'tok', query = '') {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL + query, { headers: h })
}

describe('GET /api/routes-b/recent-items', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/recent-items/route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid limit', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { GET } = await import('@/app/api/routes-b/recent-items/route')
    const res = await GET(req('tok', '?limit=0'))
    expect(res.status).toBe(400)
  })

  it('merges and sorts invoices, transactions, and expenses by recency', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindMany.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        amount: 100,
        currency: 'USD',
        status: 'paid',
        createdAt: new Date('2026-08-20'),
      },
    ])
    transactionFindMany.mockResolvedValue([
      {
        id: 'tx-1',
        type: 'withdrawal',
        amount: 50,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date('2026-08-22'),
      },
    ])
    expenseFindMany.mockResolvedValue([
      {
        id: 'exp-1',
        description: 'Software license',
        amount: 20,
        currency: 'USD',
        createdAt: new Date('2026-08-21'),
      },
    ])

    const { GET } = await import('@/app/api/routes-b/recent-items/route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items).toHaveLength(3)
    expect(json.items[0].id).toBe('tx-1')
    expect(json.items[1].id).toBe('exp-1')
    expect(json.items[2].id).toBe('inv-1')
    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('caps results at the requested limit', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindMany.mockResolvedValue([
      { id: 'inv-1', invoiceNumber: 'INV-001', amount: 1, currency: 'USD', status: 'paid', createdAt: new Date('2026-08-20') },
      { id: 'inv-2', invoiceNumber: 'INV-002', amount: 1, currency: 'USD', status: 'paid', createdAt: new Date('2026-08-19') },
    ])
    transactionFindMany.mockResolvedValue([])
    expenseFindMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/routes-b/recent-items/route')
    const res = await GET(req('tok', '?limit=1'))
    const json = await res.json()
    expect(json.items).toHaveLength(1)
  })
})
