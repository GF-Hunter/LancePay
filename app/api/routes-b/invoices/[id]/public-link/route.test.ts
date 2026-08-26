import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/audit', () => ({
  extractRequestMetadata: vi.fn(() => ({ ip: '127.0.0.1', userAgent: 'vitest' })),
  logAuditEvent: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  generateToken: vi.fn(() => 'a'.repeat(56) + '12345678'),
  hashToken: vi.fn((token: string) => `hashed:${token}`),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    $transaction: vi.fn(),
    invoicePublicLink: { updateMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import { prisma } from '@/lib/db'

const params = Promise.resolve({ id: 'inv-1' })
const user = { id: 'user-1' }
const invoice = { id: 'inv-1' }

const createdLink = {
  id: 'link-1',
  tokenHint: '12345678',
  expiresAt: null,
  createdAt: new Date('2026-08-02T00:00:00.000Z'),
}

function makeRequest(body: unknown = {}) {
  return new NextRequest('http://localhost/api/routes-b/invoices/inv-1/public-link', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: 'privy-1' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never)
  vi.mocked(prisma.invoice.findFirst).mockResolvedValue(invoice as never)
  vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 0 }, createdLink] as never)
})

describe('POST /api/routes-b/invoices/[id]/public-link', () => {
  it('generates a public link for an owned invoice and returns the plaintext token once', async () => {
    const res = await POST(makeRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.publicLink.token).toBe('a'.repeat(56) + '12345678')
    expect(body.publicLink.tokenHint).toBe('12345678')
    expect(body.publicLink.expiresAt).toBeNull()
    expect(logAuditEvent).toHaveBeenCalledWith(
      'inv-1',
      'invoice.public_link_generated',
      'user-1',
      expect.objectContaining({ publicLinkId: 'link-1' }),
    )
  })

  it('revokes any existing active link before creating a new one', async () => {
    await POST(makeRequest(), { params })
    expect(prisma.invoicePublicLink.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    expect(prisma.invoicePublicLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: 'inv-1', createdBy: 'user-1' }),
      }),
    )
  })

  it('accepts an expiresInSeconds option and returns an ISO expiry', async () => {
    const expiring = { ...createdLink, expiresAt: new Date('2026-09-01T00:00:00.000Z') }
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 0 }, expiring] as never)

    const res = await POST(makeRequest({ expiresInSeconds: 3600 }), { params })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.publicLink.expiresAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/routes-b/invoices/inv-1/public-link', { method: 'POST' }),
      { params },
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice is not owned by the user', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 for a non-positive expiresInSeconds', async () => {
    const res = await POST(makeRequest({ expiresInSeconds: -5 }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-numeric expiresInSeconds', async () => {
    const res = await POST(makeRequest({ expiresInSeconds: 'soon' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when expiresInSeconds exceeds the maximum window', async () => {
    const res = await POST(makeRequest({ expiresInSeconds: 60 * 60 * 24 * 400 }), { params })
    expect(res.status).toBe(400)
  })

  it('treats a missing/invalid JSON body as no expiry rather than failing', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/invoices/inv-1/public-link', {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(201)
  })

  it('returns 500 and logs when the transaction throws', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('db down'))
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(500)
  })
})
