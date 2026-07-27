import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const webhookEventUpsert = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    webhookEvent: { upsert: webhookEventUpsert },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/integrations/circle/payout-webhook'

function makeRequest(body: Record<string, unknown>, auth: string = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/routes-d/integrations/circle/payout-webhook', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no auth token is provided', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    const res = await POST(makeRequest({ payoutId: 'p_1' }, ''))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    const res = await POST(makeRequest({ payoutId: 'p_1' }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null as any)
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    const res = await POST(makeRequest({ payoutId: 'p_1' }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 when user is not admin', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'freelancer' })
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    const res = await POST(makeRequest({ payoutId: 'p_1' }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden: admin access required' })
  })

  it('returns 400 when payoutId is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    const res = await POST(makeRequest({ status: 'completed' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ 
      error: 'Invalid request: payoutId and status are required' 
    })
  })

  it('returns 400 when status is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    const res = await POST(makeRequest({ payoutId: 'p_1' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ 
      error: 'Invalid request: payoutId and status are required' 
    })
  })

  it('normalizes invalid status to pending', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    webhookEventUpsert.mockResolvedValue({
      id: 'evt_1',
      externalId: 'p_1',
      eventType: 'payout.status_changed',
      status: 'pending',
      payload: { payoutId: 'p_1' },
    })
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    
    const res = await POST(makeRequest({ payoutId: 'p_1', status: 'unknown' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('pending')
    expect(webhookEventUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'pending' }),
        create: expect.objectContaining({ status: 'pending' }),
      }),
    )
  })

  it('accepts valid status values', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    webhookEventUpsert.mockResolvedValue({
      id: 'evt_1',
      externalId: 'p_1',
      status: 'completed',
    })
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    
    for (const validStatus of ['pending', 'processing', 'completed', 'failed', 'cancelled']) {
      webhookEventUpsert.mockResolvedValue({
        id: 'evt_1',
        externalId: 'p_1',
        status: validStatus,
      })
      const res = await POST(makeRequest({ payoutId: 'p_1', status: validStatus }))
      expect(res.status).toBe(200)
    }
  })

  it('creates a new webhook event', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    webhookEventUpsert.mockResolvedValue({
      id: 'evt_1',
      externalId: 'p_1',
      eventType: 'payout.status_changed',
      status: 'completed',
      payload: { payoutId: 'p_1', amount: '100.00', currency: 'NGN', txHash: '0xabc' },
    })
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    
    const res = await POST(makeRequest({
      payoutId: 'p_1',
      status: 'completed',
      amount: '100.00',
      currency: 'NGN',
      txHash: '0xabc',
    }))
    
    expect(res.status).toBe(200)
    expect(res.json()).resolves.toEqual({
      success: true,
      eventId: 'evt_1',
      status: 'completed',
    })
    expect(webhookEventUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 'p_1' },
        create: expect.objectContaining({
          externalId: 'p_1',
          eventType: 'payout.status_changed',
        }),
      }),
    )
  })

  it('returns 500 on database error', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    webhookEventUpsert.mockRejectedValue(new Error('db down'))
    const { POST } = await import('@/app/api/routes-d/integrations/circle/payout-webhook/route')
    
    const res = await POST(makeRequest({ payoutId: 'p_1', status: 'completed' }))
    
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to process Circle payout webhook',
    })
  })
})