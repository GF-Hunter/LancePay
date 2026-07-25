import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const bankFeedSyncFindMany = vi.fn()
const bankFeedSyncCount = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    bankFeedSync: { findMany: bankFeedSyncFindMany, count: bankFeedSyncCount },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/bank-feeds/errors'

function makeRequest(query: string = '', auth: string | null = 'Bearer token') {
  const headers: Record<string, string> = {}
  if (auth) headers.authorization = auth
  return new NextRequest(`${BASE_URL}${query}`, { method: 'GET', headers })
}

describe('GET /api/routes-d/bank-feeds/errors', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no auth token is provided', async () => {
    const { GET } = await import('@/app/api/routes-d/bank-feeds/errors/route')
    const res = await GET(makeRequest('', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/bank-feeds/errors/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/bank-feeds/errors/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns empty errors list when the user has no feed errors', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankFeedSyncFindMany.mockResolvedValue([])
    bankFeedSyncCount.mockResolvedValue(0)
    const { GET } = await import('@/app/api/routes-d/bank-feeds/errors/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ errors: [], total: 0, page: 1, limit: 20 })
  })

  it('returns bank feed errors with proper formatting', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const errorDate = new Date('2025-01-15')
    bankFeedSyncFindMany.mockResolvedValue([
      {
        id: 'sync_1',
        bankAccountId: 'ba_1',
        lastError: 'Failed to connect to bank',
        lastSyncedAt: null,
        updatedAt: errorDate,
        bankAccount: { bankName: 'GTBank', accountNumber: '1234567890' },
      },
    ])
    bankFeedSyncCount.mockResolvedValue(1)
    const { GET } = await import('@/app/api/routes-d/bank-feeds/errors/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.total).toBe(1)
    expect(json.errors).toEqual([
      {
        syncId: 'sync_1',
        bankAccountId: 'ba_1',
        bankName: 'GTBank',
        accountNumber: '1234567890',
        errorMessage: 'Failed to connect to bank',
        occurredAt: errorDate,
      },
    ])
  })

  it('supports pagination with page and limit query parameters', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankFeedSyncFindMany.mockResolvedValue([])
    bankFeedSyncCount.mockResolvedValue(50)
    const { GET } = await import('@/app/api/routes-d/bank-feeds/errors/route')
    const res = await GET(makeRequest('?page=2&limit=10'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.page).toBe(2)
    expect(json.limit).toBe(10)
    expect(bankFeedSyncFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    )
  })

  it('returns 500 when the database lookup fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankFeedSyncFindMany.mockRejectedValue(new Error('db error'))
    const { GET } = await import('@/app/api/routes-d/bank-feeds/errors/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
