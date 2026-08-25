import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    pushSubscription: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const validPayload = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'p256dh-key-value', auth: 'auth-key-value' },
  userAgent: 'Mozilla/5.0',
}
const mockSubscription = {
  id: 'sub-1',
  endpoint: validPayload.endpoint,
  userAgent: validPayload.userAgent,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/push-subscriptions', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.pushSubscription.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue(mockSubscription as never)
})

describe('POST /api/routes-b/push-subscriptions', () => {
  it('creates a new subscription (upsert)', async () => {
    const res = await POST(makePost(validPayload))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.subscription.endpoint).toBe(validPayload.endpoint)
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endpoint: validPayload.endpoint } }),
    )
  })

  it('updates an existing subscription belonging to the same user', async () => {
    vi.mocked(prisma.pushSubscription.findUnique).mockResolvedValue({
      id: 'sub-1',
      userId: 'user-1',
    } as never)
    const res = await POST(makePost(validPayload))
    expect(res.status).toBe(200)
  })

  it('returns 409 when the endpoint belongs to a different user', async () => {
    vi.mocked(prisma.pushSubscription.findUnique).mockResolvedValue({
      id: 'sub-1',
      userId: 'someone-else',
    } as never)
    const res = await POST(makePost(validPayload))
    expect(res.status).toBe(409)
  })

  it('returns 400 when endpoint is missing', async () => {
    const res = await POST(makePost({ keys: validPayload.keys }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when endpoint is not a valid URL', async () => {
    const res = await POST(makePost({ ...validPayload, endpoint: 'not-a-url' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when keys is missing', async () => {
    const res = await POST(makePost({ endpoint: validPayload.endpoint }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when keys.p256dh is missing', async () => {
    const res = await POST(makePost({ endpoint: validPayload.endpoint, keys: { auth: 'auth-key' } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when keys.auth is missing', async () => {
    const res = await POST(makePost({ endpoint: validPayload.endpoint, keys: { p256dh: 'p256dh-key' } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/push-subscriptions', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/routes-b/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
