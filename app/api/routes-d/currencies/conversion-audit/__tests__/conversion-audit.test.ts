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

const BASE_URL = 'http://localhost/api/routes-d/currencies/conversion-audit'

function makeGet(query = '', authHeader: string | null = 'Bearer token') {
  return GET(
    new NextRequest(`${BASE_URL}${query}`, {
      method: 'GET',
      headers: authHeader ? { authorization: authHeader } : {},
    }),
  )
}

describe('GET /api/routes-d/currencies/conversion-audit', () => {
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
    expect((await res.json()).error).toBe('status must be one of: pending, completed, failed')
  })

  it('scopes query to authenticated user and type conversion', async () => {
    await makeGet()
    expect(txDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', type: 'conversion' }),
      }),
    )
  })

  it('filters by status when valid', async () => {
    await makeGet('?status=failed')
    expect(txDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'failed' }) }),
    )
  })

  it('returns mapped audit rows including error and autoTriggered', async () => {
    txDelegate.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        currency: 'USD',
        amount: { toString: () => '100.00' },
        exchangeRate: { toString: () => '1500.0000' },
        status: 'failed',
        autoSwapTriggered: true,
        error: 'insufficient liquidity',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: null,
      },
    ])
    const res = await makeGet()
    const json = await res.json()
    expect(json.auditTrail[0]).toMatchObject({
      id: 'tx-1',
      status: 'failed',
      autoTriggered: true,
      error: 'insufficient liquidity',
    })
  })

  it('returns 500 when the database throws', async () => {
    txDelegate.findMany.mockRejectedValue(new Error('db down'))
    const res = await makeGet()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Failed to fetch conversion audit trail')
  })
})
