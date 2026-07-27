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

const BASE_URL = 'http://localhost/api/routes-d/onchain/settlements'

function makeGet(query = '', authHeader: string | null = 'Bearer token') {
  return GET(
    new NextRequest(`${BASE_URL}${query}`, {
      method: 'GET',
      headers: authHeader ? { authorization: authHeader } : {},
    }),
  )
}

describe('GET /api/routes-d/onchain/settlements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
    txDelegate.findMany.mockResolvedValue([])
  })

  it('returns 401 when no auth header', async () => {
    const res = await makeGet('', null)
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await makeGet()
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await makeGet()
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid status filter', async () => {
    const res = await makeGet('?status=bogus')
    expect(res.status).toBe(400)
  })

  it('scopes query to authenticated user and non-null txHash', async () => {
    await makeGet()
    expect(txDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', txHash: { not: null } }),
      }),
    )
  })

  it('marks completed transactions as settled', async () => {
    txDelegate.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        txHash: '0xabc',
        status: 'completed',
        amount: { toString: () => '50.00' },
        currency: 'USD',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: new Date('2026-01-01T00:05:00.000Z'),
      },
    ])
    const res = await makeGet()
    const json = await res.json()
    expect(json.settlements[0].settled).toBe(true)
  })

  it('marks pending transactions as not settled', async () => {
    txDelegate.findMany.mockResolvedValue([
      {
        id: 'tx-2',
        txHash: '0xdef',
        status: 'pending',
        amount: { toString: () => '25.00' },
        currency: 'USD',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: null,
      },
    ])
    const res = await makeGet()
    const json = await res.json()
    expect(json.settlements[0].settled).toBe(false)
  })

  it('returns 500 when the database throws', async () => {
    txDelegate.findMany.mockRejectedValue(new Error('db down'))
    const res = await makeGet()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Failed to fetch settlement status')
  })
})
