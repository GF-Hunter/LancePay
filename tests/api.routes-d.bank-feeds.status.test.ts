import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const bankAccountFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    bankAccount: { findMany: bankAccountFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/bank-feeds/status'

function makeRequest(auth: string | null = 'Bearer token') {
  const headers: Record<string, string> = {}
  if (auth) headers.authorization = auth
  return new NextRequest(BASE_URL, { method: 'GET', headers })
}

describe('GET /api/routes-d/bank-feeds/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no auth token is provided', async () => {
    const { GET } = await import('@/app/api/routes-d/bank-feeds/status/route')
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/bank-feeds/status/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/bank-feeds/status/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns idle overall status with an empty feeds list when the user has no bank accounts', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankAccountFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/routes-d/bank-feeds/status/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'idle', feeds: [] })
    expect(bankAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } }),
    )
  })

  it('reports not_connected for accounts with no feed sync row yet', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankAccountFindMany.mockResolvedValue([
      { id: 'ba_1', bankName: 'GTBank', accountNumber: '0123456789', feedSync: null },
    ])
    const { GET } = await import('@/app/api/routes-d/bank-feeds/status/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('not_connected')
    expect(json.feeds).toEqual([
      {
        bankAccountId: 'ba_1',
        bankName: 'GTBank',
        accountNumber: '0123456789',
        status: 'not_connected',
        lastSyncedAt: null,
        lastError: null,
      },
    ])
  })

  it('surfaces per-account sync status and prioritizes error as the overall status', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const lastSyncedAt = new Date('2025-01-01')
    bankAccountFindMany.mockResolvedValue([
      {
        id: 'ba_1',
        bankName: 'GTBank',
        accountNumber: '0123456789',
        feedSync: { status: 'idle', lastSyncedAt, lastError: null },
      },
      {
        id: 'ba_2',
        bankName: 'Zenith Bank',
        accountNumber: '9988776655',
        feedSync: { status: 'error', lastSyncedAt: null, lastError: 'provider timeout' },
      },
    ])
    const { GET } = await import('@/app/api/routes-d/bank-feeds/status/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('error')
    expect(json.feeds).toHaveLength(2)
    expect(json.feeds[1]).toEqual({
      bankAccountId: 'ba_2',
      bankName: 'Zenith Bank',
      accountNumber: '9988776655',
      status: 'error',
      lastSyncedAt: null,
      lastError: 'provider timeout',
    })
  })

  it('returns 500 when the database lookup fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankAccountFindMany.mockRejectedValue(new Error('db down'))
    const { GET } = await import('@/app/api/routes-d/bank-feeds/status/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
