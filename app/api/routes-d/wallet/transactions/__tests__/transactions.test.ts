import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GET } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
const txDelegate = prisma.transaction as unknown as {
  findMany: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
}

const BASE_URL = 'http://localhost/api/routes-d/wallet/transactions'

function makeGet(query = '', authHeader: string | null = 'Bearer token') {
  return new NextRequest(`${BASE_URL}${query}`, {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

function authAsUser() {
  mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
  userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
}

describe('GET /api/routes-d/wallet/transactions', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGet('', null))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(404)
  })

  it('returns the user transactions with defaults', async () => {
    authAsUser()
    const rows = [
      { id: 'tx-1', type: 'payout', status: 'completed', amount: '25.00', currency: 'USD' },
    ]
    txDelegate.findMany.mockResolvedValue(rows)
    txDelegate.count.mockResolvedValue(1)

    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transactions).toHaveLength(1)
    expect(body.total).toBe(1)
    expect(body.limit).toBe(20)
    expect(body.offset).toBe(0)

    const args = txDelegate.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ userId: 'user-1' })
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(args.take).toBe(20)
    expect(args.skip).toBe(0)
  })

  it('applies type, status, currency, and date filters scoped to the user', async () => {
    authAsUser()
    txDelegate.findMany.mockResolvedValue([])
    txDelegate.count.mockResolvedValue(0)

    const res = await GET(
      makeGet(
        '?type=payout&status=completed&currency=USD&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&limit=5&offset=10'
      )
    )
    expect(res.status).toBe(200)

    const args = txDelegate.findMany.mock.calls[0][0]
    expect(args.where.userId).toBe('user-1')
    expect(args.where.type).toBe('payout')
    expect(args.where.status).toBe('completed')
    expect(args.where.currency).toBe('USD')
    expect(args.where.createdAt.gte).toEqual(new Date('2026-01-01T00:00:00Z'))
    expect(args.where.createdAt.lte).toEqual(new Date('2026-02-01T00:00:00Z'))
    expect(args.take).toBe(5)
    expect(args.skip).toBe(10)
  })

  it('rejects an invalid limit', async () => {
    authAsUser()
    expect((await GET(makeGet('?limit=0'))).status).toBe(400)
    expect((await GET(makeGet('?limit=101'))).status).toBe(400)
    expect((await GET(makeGet('?limit=abc'))).status).toBe(400)
  })

  it('rejects an invalid offset', async () => {
    authAsUser()
    expect((await GET(makeGet('?offset=-1'))).status).toBe(400)
  })

  it('rejects malformed dates and inverted ranges', async () => {
    authAsUser()
    expect((await GET(makeGet('?from=not-a-date'))).status).toBe(400)
    expect((await GET(makeGet('?to=not-a-date'))).status).toBe(400)
    expect(
      (await GET(makeGet('?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z'))).status
    ).toBe(400)
  })

  it('returns 500 when the query fails', async () => {
    authAsUser()
    txDelegate.findMany.mockRejectedValue(new Error('db down'))
    txDelegate.count.mockResolvedValue(0)
    const res = await GET(makeGet())
    expect(res.status).toBe(500)
  })
})
