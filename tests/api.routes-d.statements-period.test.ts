import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const findUnique = vi.fn()
const transactionFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    transaction: { findMany: transactionFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/statements/2026-06'

function makeRequest(url = BASE_URL, withAuth = true) {
  return new NextRequest(url, {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

function makeParams(period: string) {
  return { params: { period } }
}

const sampleTransactions = [
  {
    id: 'tx_1',
    type: 'deposit',
    status: 'completed',
    amount: 100,
    currency: 'USD',
    createdAt: new Date('2026-06-02T10:00:00Z'),
    completedAt: new Date('2026-06-02T10:01:00Z'),
  },
  {
    id: 'tx_2',
    type: 'withdrawal',
    status: 'completed',
    amount: 40,
    currency: 'USD',
    createdAt: new Date('2026-06-10T09:00:00Z'),
    completedAt: null,
  },
  {
    id: 'tx_3',
    type: 'deposit',
    status: 'pending',
    amount: 25,
    currency: 'EUR',
    createdAt: new Date('2026-06-15T12:00:00Z'),
    completedAt: null,
  },
]

describe('GET /api/routes-d/statements/[period]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no authorization header is present', async () => {
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(BASE_URL, false), makeParams('2026-06'))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(), makeParams('2026-06'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(), makeParams('2026-06'))
    expect(res.status).toBe(404)
  })

  it.each(['2026-13', '2026-00', 'abc', '2026-6', '202606'])(
    'returns 400 for invalid period %s',
    async (period) => {
      verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
      findUnique.mockResolvedValue({ id: 'user_1' })
      const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
      const res = await GET(makeRequest(), makeParams(period))
      expect(res.status).toBe(400)
    },
  )

  it('returns 400 for a period in the future', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(), makeParams('2199-01'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/future/i)
  })

  it('returns 400 for an unsupported format', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(`${BASE_URL}?format=xml`), makeParams('2026-06'))
    expect(res.status).toBe(400)
  })

  it('returns the JSON statement with per-currency and per-type totals', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindMany.mockResolvedValue(sampleTransactions)
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(), makeParams('2026-06'))
    expect(res.status).toBe(200)
    const { statement } = await res.json()
    expect(statement.period).toBe('2026-06')
    expect(statement.transactionCount).toBe(3)
    expect(statement.totalsByCurrency.USD).toEqual({ count: 2, total: 140 })
    expect(statement.totalsByCurrency.EUR).toEqual({ count: 1, total: 25 })
    expect(statement.totalsByType.deposit).toBe(125)
    expect(statement.totalsByType.withdrawal).toBe(40)
    expect(statement.transactions).toHaveLength(3)
  })

  it('scopes the query to the authenticated user and the period window', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    await GET(makeRequest(), makeParams('2026-06'))
    expect(transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user_1',
          createdAt: {
            gte: new Date(Date.UTC(2026, 5, 1)),
            lt: new Date(Date.UTC(2026, 6, 1)),
          },
        }),
      }),
    )
  })

  it('returns CSV with an attachment header when format=csv', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindMany.mockResolvedValue(sampleTransactions)
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(`${BASE_URL}?format=csv`), makeParams('2026-06'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('statement-2026-06.csv')
    const body = await res.text()
    const lines = body.split('\n')
    expect(lines[0]).toBe('id,type,status,amount,currency,createdAt,completedAt')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toContain('tx_1')
  })

  it('returns an empty statement for a month with no transactions', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(), makeParams('2026-06'))
    expect(res.status).toBe(200)
    const { statement } = await res.json()
    expect(statement.transactionCount).toBe(0)
    expect(statement.totalsByCurrency).toEqual({})
    expect(statement.transactions).toEqual([])
  })

  it('returns 500 when the database query fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindMany.mockRejectedValue(new Error('db down'))
    const { GET } = await import('@/app/api/routes-d/statements/[period]/route')
    const res = await GET(makeRequest(), makeParams('2026-06'))
    expect(res.status).toBe(500)
  })
})
