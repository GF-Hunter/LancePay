import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const bankAccountFindUnique = vi.fn()
const bankFeedSyncFindUnique = vi.fn()
const bankFeedSyncUpdate = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    bankAccount: { findUnique: bankAccountFindUnique },
    bankFeedSync: { findUnique: bankFeedSyncFindUnique, update: bankFeedSyncUpdate },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/bank-feeds/refresh'

function makeRequest(body?: unknown, auth: string | null = 'Bearer token') {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (auth) headers.set('authorization', `Bearer ${auth}`)
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/routes-d/bank-feeds/refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({ bankAccountId: 'ba_1' }, null))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({ bankAccountId: 'ba_1' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({ bankAccountId: 'ba_1' }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when bankAccountId is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('bankAccountId')
  })

  it('returns 404 when the bank account does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankAccountFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({ bankAccountId: 'ba_1' }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the bank account belongs to a different user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankAccountFindUnique.mockResolvedValue({ id: 'ba_1', userId: 'user_2' })
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({ bankAccountId: 'ba_1' }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when bank feed sync record does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankAccountFindUnique.mockResolvedValue({ id: 'ba_1', userId: 'user_1' })
    bankFeedSyncFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({ bankAccountId: 'ba_1' }))
    expect(res.status).toBe(404)
  })

  it('successfully triggers a bank feed refresh', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankAccountFindUnique.mockResolvedValue({ id: 'ba_1', userId: 'user_1' })
    bankFeedSyncFindUnique.mockResolvedValue({ id: 'sync_1', bankAccountId: 'ba_1' })
    bankFeedSyncUpdate.mockResolvedValue({
      id: 'sync_1',
      bankAccountId: 'ba_1',
      status: 'syncing',
      updatedAt: new Date(),
    })
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({ bankAccountId: 'ba_1' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.message).toContain('refresh triggered')
    expect(json.syncId).toBe('sync_1')
    expect(json.status).toBe('syncing')
  })

  it('returns 500 when the database update fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    bankAccountFindUnique.mockResolvedValue({ id: 'ba_1', userId: 'user_1' })
    bankFeedSyncFindUnique.mockResolvedValue({ id: 'sync_1', bankAccountId: 'ba_1' })
    bankFeedSyncUpdate.mockRejectedValue(new Error('db error'))
    const { POST } = await import('@/app/api/routes-d/bank-feeds/refresh/route')
    const res = await POST(makeRequest({ bankAccountId: 'ba_1' }))
    expect(res.status).toBe(500)
  })
})
