import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userWebhook: { findMany: vi.fn(), updateMany: vi.fn() },
    webhookDelivery: { create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockWebhookFindMany = prisma.userWebhook.findMany as unknown as ReturnType<typeof vi.fn>
const mockWebhookUpdateMany = prisma.userWebhook.updateMany as unknown as ReturnType<typeof vi.fn>
const mockDeliveryCreate = prisma.webhookDelivery.create as unknown as ReturnType<typeof vi.fn>

const URL = 'http://localhost/api/routes-d/integrations/zapier/trigger'

function makeReq(body: unknown = { event: 'invoice.paid' }, token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/routes-d/integrations/zapier/trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockResolvedValue({ userId: 'privy-user-123' })
    mockUserFindUnique.mockResolvedValue({ id: 'user-123' })
    mockWebhookFindMany.mockResolvedValue([{ id: 'webhook-1' }, { id: 'webhook-2' }])
    mockDeliveryCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'delivery-1', webhookId: data.webhookId, eventType: data.eventType, status: data.status }),
    )
    mockWebhookUpdateMany.mockResolvedValue({ count: 2 })
  })

  it('returns 401 when no authorization header is present', async () => {
    const res = await POST(makeReq({ event: 'invoice.paid' }, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when the user is not found', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await POST(makeReq())
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when event is missing or not recognized', async () => {
    const res = await POST(makeReq({ event: 'not.a.real.event' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/event must be one of/i)
  })

  it('returns 200 with triggered: 0 when there are no active matching webhooks', async () => {
    mockWebhookFindMany.mockResolvedValue([])
    const res = await POST(makeReq({ event: 'invoice.paid' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.triggered).toBe(0)
    expect(json.deliveries).toEqual([])
    expect(mockDeliveryCreate).not.toHaveBeenCalled()
  })

  it('scopes the webhook lookup to the authenticated user (ownership check)', async () => {
    await POST(makeReq({ event: 'invoice.paid' }))
    expect(mockWebhookFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-123', isActive: true }),
      }),
    )
  })

  it('returns 202 and creates a delivery per matching webhook on the happy path', async () => {
    const res = await POST(makeReq({ event: 'invoice.paid', payload: { invoiceId: 'inv-1' } }))
    expect(res.status).toBe(202)

    const json = await res.json()
    expect(json.triggered).toBe(2)
    expect(json.event).toBe('invoice.paid')
    expect(json.deliveries).toHaveLength(2)
    expect(mockDeliveryCreate).toHaveBeenCalledTimes(2)
    expect(mockWebhookUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['webhook-1', 'webhook-2'] } },
      }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockWebhookFindMany.mockRejectedValue(new Error('database unavailable'))
    const res = await POST(makeReq({ event: 'invoice.paid' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to trigger Zapier integration')
  })
})
