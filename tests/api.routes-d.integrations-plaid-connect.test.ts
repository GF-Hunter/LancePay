import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextResponse, NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const plaidAccountUpsert = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    plaidAccount: { upsert: plaidAccountUpsert },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/integrations/plaid/connect'

function makeRequest(body: Record<string, unknown>, auth: string | null = 'Bearer token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) headers.authorization = auth
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('POST /api/routes-d/integrations/plaid/connect', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no auth token is provided', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/plaid/connect/route')
    const res = await POST(makeRequest({ publicToken: 'test' }, null))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/integrations/plaid/connect/route')
    const res = await POST(makeRequest({ publicToken: 'test' }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid token' })
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/integrations/plaid/connect/route')
    const res = await POST(makeRequest({ publicToken: 'test' }))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'User not found' })
  })

  it('returns 400 when required fields are missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/integrations/plaid/connect/route')
    
    const res = await POST(makeRequest({ accounts: [] }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid request: publicToken and accounts are required',
    })
  })

  it('skips invalid account entries', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    plaidAccountUpsert.mockResolvedValue({ id: 'pa_1' })
    const { POST } = await import('@/app/api/routes-d/integrations/plaid/connect/route')
    
    const res = await POST(makeRequest({
      publicToken: 'public-sandbox-token',
      accounts: [
        { id: 'pa_1', name: 'Checking', type: 'depository' },
        { name: 'No ID field', type: 'depository' },
        { id: 'pa_2', type: 'depository' },
      ],
    }))
    
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.accounts).toHaveLength(1)
  })

  it('creates new Plaid accounts', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    plaidAccountUpsert.mockResolvedValue({
      id: 'pa_1',
      userId: 'user_1',
      plaidItemId: 'plaid_item_public-s',
      plaidAccountId: 'acc_1',
      institutionName: 'Chase',
      accountName: 'Checking',
      mask: '1234',
      type: 'depository',
      subtype: 'checking',
      status: 'active',
      lastSyncedAt: new Date(),
    })
    const { POST } = await import('@/app/api/routes-d/integrations/plaid/connect/route')
    
    const res = await POST(makeRequest({
      publicToken: 'public-sandbox-token',
      accounts: [
        {
          id: 'acc_1',
          name: 'Checking',
          mask: '1234',
          type: 'depository',
          subtype: 'checking',
          institutionName: 'Chase',
        },
      ],
    }))
    
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.accounts).toHaveLength(1)
    expect(plaidAccountUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plaidAccountId: 'acc_1' },
        create: expect.objectContaining({ plaidAccountId: 'acc_1' }),
        update: expect.any(Object),
      }),
    )
  })

  it('updates existing Plaid accounts', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    plaidAccountUpsert.mockResolvedValue({
      id: 'pa_1',
      userId: 'user_1',
      institutionName: 'Chase',
      accountName: 'Checking Updated',
      status: 'active',
    })
    const { POST } = await import('@/app/api/routes-d/integrations/plaid/connect/route')
    
    const res = await POST(makeRequest({
      publicToken: 'public-sandbox-token',
      accounts: [
        {
          id: 'acc_1',
          name: 'Checking Updated',
          type: 'depository',
          institutionName: 'Chase',
        },
      ],
    }))
    
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.accounts[0].accountName).toBe('Checking Updated')
  })

  it('returns 500 on database error', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    plaidAccountUpsert.mockRejectedValue(new Error('db down'))
    const { POST } = await import('@/app/api/routes-d/integrations/plaid/connect/route')
    
    const res = await POST(makeRequest({
      publicToken: 'public-sandbox-token',
      accounts: [{ id: 'acc_1', name: 'Checking', type: 'depository' }],
    }))
    
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to connect Plaid account' })
  })
})