import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const plaidAccountFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    plaidAccount: { findMany: plaidAccountFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/integrations/plaid/accounts'

function makeRequest(auth: string | null = 'Bearer token') {
  const headers: Record<string, string> = {}
  if (auth) headers.authorization = auth
  return new NextRequest(BASE_URL, { method: 'GET', headers })
}

describe('GET /api/routes-d/integrations/plaid/accounts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no auth token is provided', async () => {
    const { GET } = await import('@/app/api/routes-d/integrations/plaid/accounts/route')
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/integrations/plaid/accounts/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid token' })
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/integrations/plaid/accounts/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'User not found' })
  })

  it('returns an empty list when the user has no connected Plaid accounts', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    plaidAccountFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/routes-d/integrations/plaid/accounts/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ accounts: [] })
    expect(plaidAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } }),
    )
  })

  it('only returns accounts scoped to the authenticated user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    plaidAccountFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/routes-d/integrations/plaid/accounts/route')
    await GET(makeRequest())
    expect(plaidAccountFindMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('lists connected Plaid accounts for the authenticated user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const lastSyncedAt = new Date('2026-07-20T00:00:00.000Z')
    plaidAccountFindMany.mockResolvedValue([
      {
        id: 'pa_1',
        institutionName: 'Chase',
        accountName: 'Checking',
        mask: '1234',
        type: 'depository',
        subtype: 'checking',
        status: 'active',
        lastSyncedAt,
      },
      {
        id: 'pa_2',
        institutionName: 'Ally',
        accountName: 'Savings',
        mask: '5678',
        type: 'depository',
        subtype: 'savings',
        status: 'error',
        lastSyncedAt: null,
      },
    ])
    const { GET } = await import('@/app/api/routes-d/integrations/plaid/accounts/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.accounts).toHaveLength(2)
    expect(json.accounts[0]).toEqual({
      id: 'pa_1',
      institutionName: 'Chase',
      accountName: 'Checking',
      mask: '1234',
      type: 'depository',
      subtype: 'checking',
      status: 'active',
      lastSyncedAt: lastSyncedAt.toISOString(),
    })
    expect(json.accounts[1]).toEqual({
      id: 'pa_2',
      institutionName: 'Ally',
      accountName: 'Savings',
      mask: '5678',
      type: 'depository',
      subtype: 'savings',
      status: 'error',
      lastSyncedAt: null,
    })
  })

  it('returns 500 when the database lookup fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    plaidAccountFindMany.mockRejectedValue(new Error('db down'))
    const { GET } = await import('@/app/api/routes-d/integrations/plaid/accounts/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to list connected Plaid accounts',
    })
  })
})
