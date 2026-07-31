import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GET } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
const txDelegate = prisma.transaction as unknown as { findMany: ReturnType<typeof vi.fn> }

const BASE_URL = 'http://localhost/api/routes-d/currencies/conversion-history'

function makeGet(query = '', authHeader: string | null = 'Bearer token') {
  return GET(
    new NextRequest(`${BASE_URL}${query}`, {
      method: 'GET',
      headers: authHeader ? { authorization: authHeader } : {},
    }),
  )
}

describe('GET /api/routes-d/currencies/conversion-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
    txDelegate.findMany.mockResolvedValue([])
  })

  it('returns 401 when no auth header', async () => {
    const res = await makeGet('', null)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Unauthorized')
  })

  it('returns 401 when token is invalid', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await makeGet()
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Invalid token')
  })

  it('returns 404 when user not found', async () => {
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await makeGet()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('User not found')
  })

  it('returns 200 with empty history', async () => {
    const res = await makeGet()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.conversions).toEqual([])
  })

  it('scopes query to the authenticated user and type conversion', async () => {
    await makeGet()
    expect(txDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', type: 'conversion' }),
      }),
    )
  })

  it('filters by currency query param when provided', async () => {
    await makeGet('?currency=eur')
    expect(txDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ currency: 'EUR' }),
      }),
    )
  })

  it('caps limit at MAX_LIMIT (200)', async () => {
    await makeGet('?limit=9999')
    expect(txDelegate.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }))
  })

  it('returns mapped conversion rows', async () => {
    txDelegate.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        currency: 'USD',
        amount: { toString: () => '100.00' },
        ngnAmount: { toString: () => '150000.00' },
        exchangeRate: { toString: () => '1500.0000' },
        status: 'completed',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: new Date('2026-01-01T00:01:00.000Z'),
      },
    ])
    const res = await makeGet()
    const json = await res.json()
    expect(json.conversions[0]).toMatchObject({
      id: 'tx-1',
      currency: 'USD',
      amount: '100.00',
      convertedAmount: '150000.00',
      exchangeRate: '1500.0000',
      status: 'completed',
    })
  })

  it('returns 500 when the database throws', async () => {
    txDelegate.findMany.mockRejectedValue(new Error('db down'))
    const res = await makeGet()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Failed to fetch conversion history')
  })
})
