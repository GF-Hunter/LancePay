import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn() },
    refundOverride: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockAdmin = { id: 'admin-1', email: 'admin@example.com', role: 'admin' }
const mockNonAdmin = { id: 'user-1', email: 'user@example.com', role: 'freelancer' }
const mockClaims = { userId: 'privy-1' }
const mockInvoice = { id: 'inv-1', amount: 500 }

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/admin/refunds/override', {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockAdmin as any)
  vi.mocked(prisma.invoice.findUnique).mockResolvedValue(mockInvoice as any)
  vi.mocked(prisma.refundOverride.create).mockResolvedValue({
    id: 'refund-1',
    invoiceId: 'inv-1',
    amount: 100,
    reason: 'goodwill',
    status: 'completed',
    createdAt: new Date(),
  } as any)
  vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any)
})

describe('POST /api/routes-d/admin/refunds/override', () => {
  it('creates a refund override for a valid admin request', async () => {
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: 100, reason: 'goodwill' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.refundOverrideId).toBe('refund-1')
  })

  it('writes an audit event with a signed metadata payload', async () => {
    await POST(makeRequest({ invoiceId: 'inv-1', amount: 100, reason: 'goodwill' }))
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 'inv-1',
          eventType: 'admin.refund.override',
          actorId: 'admin-1',
          signature: expect.any(String),
        }),
      }),
    )
  })

  it('returns 403 for a non-admin user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockNonAdmin as any)
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: 100, reason: 'goodwill' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when invoiceId is missing', async () => {
    const res = await POST(makeRequest({ amount: 100, reason: 'goodwill' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is missing', async () => {
    const res = await POST(makeRequest({ invoiceId: 'inv-1', reason: 'goodwill' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is zero or negative', async () => {
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: -5, reason: 'goodwill' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is not a number', async () => {
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: 'abc', reason: 'goodwill' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reason is missing', async () => {
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: 100 }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the invoice does not exist', async () => {
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest({ invoiceId: 'inv-missing', amount: 100, reason: 'goodwill' }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when the refund amount exceeds the invoice amount', async () => {
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: 9999, reason: 'goodwill' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(new NextRequest('http://localhost/api/routes-d/admin/refunds/override', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null as any)
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: 100, reason: 'goodwill' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the admin user record is missing', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: 100, reason: 'goodwill' }))
    expect(res.status).toBe(404)
  })

  it('handles a malformed JSON body gracefully as a validation error', async () => {
    const req = new NextRequest('http://localhost/api/routes-d/admin/refunds/override', {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: '{not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when the database call fails', async () => {
    vi.mocked(prisma.refundOverride.create).mockRejectedValue(new Error('db down'))
    const res = await POST(makeRequest({ invoiceId: 'inv-1', amount: 100, reason: 'goodwill' }))
    expect(res.status).toBe(500)
  })
})
