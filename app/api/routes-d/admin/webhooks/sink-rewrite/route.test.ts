import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    webhook: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockAdmin = { id: 'user-1', role: 'admin', email: 'admin@test.com' }
const mockUser = { id: 'user-2', role: 'user', email: 'user@test.com' }
const mockClaims = { userId: 'privy-1' }

const mockWebhook = { id: 'wh-1', targetUrl: 'https://old.example.com/hook' }
const mockUpdated = { id: 'wh-1', targetUrl: 'https://new.example.com/hook', updatedAt: new Date() }

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/admin/webhooks/sink-rewrite', {
    method: 'PATCH',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockAdmin as any)
  vi.mocked(prisma.webhook.findUnique).mockResolvedValue(mockWebhook as any)
  vi.mocked(prisma.webhook.update).mockResolvedValue(mockUpdated as any)
})

describe('PATCH /api/routes-d/admin/webhooks/sink-rewrite', () => {
  it('rewrites the sink URL successfully', async () => {
    const res = await makeRequest({ webhookId: 'wh-1', newTargetUrl: 'https://new.example.com/hook' })
      .then((r) => PATCH(r as NextRequest))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.webhook.targetUrl).toBe('https://new.example.com/hook')
    expect(data.previousUrl).toBe('https://old.example.com/hook')
    expect(data.rewrittenBy).toBe('admin@test.com')
  })

  it('returns 400 when webhookId is missing', async () => {
    const res = await PATCH(makeRequest({ newTargetUrl: 'https://new.example.com/hook' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when newTargetUrl is missing', async () => {
    const res = await PATCH(makeRequest({ webhookId: 'wh-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when newTargetUrl is not a valid URL', async () => {
    const res = await PATCH(makeRequest({ webhookId: 'wh-1', newTargetUrl: 'not-a-url' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when newTargetUrl uses non-http protocol', async () => {
    const res = await PATCH(makeRequest({ webhookId: 'wh-1', newTargetUrl: 'ftp://example.com/hook' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when webhook not found', async () => {
    vi.mocked(prisma.webhook.findUnique).mockResolvedValue(null)
    const res = await PATCH(makeRequest({ webhookId: 'wh-99', newTargetUrl: 'https://new.example.com/hook' }))
    expect(res.status).toBe(404)
  })

  it('returns 401 when no token', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/routes-d/admin/webhooks/sink-rewrite', {
        method: 'PATCH',
        body: JSON.stringify({ webhookId: 'wh-1', newTargetUrl: 'https://new.example.com' }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
    const res = await PATCH(makeRequest({ webhookId: 'wh-1', newTargetUrl: 'https://new.example.com/hook' }))
    expect(res.status).toBe(403)
  })

  it('returns 500 on unexpected error', async () => {
    vi.mocked(prisma.webhook.update).mockRejectedValue(new Error('DB error'))
    const res = await PATCH(makeRequest({ webhookId: 'wh-1', newTargetUrl: 'https://new.example.com/hook' }))
    expect(res.status).toBe(500)
  })
})
