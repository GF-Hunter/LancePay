import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const disputeFindUnique = vi.fn()
const invoiceFindFirst = vi.fn()
const disputeMessageCreate = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    dispute: { findUnique: disputeFindUnique },
    invoice: { findFirst: invoiceFindFirst },
    disputeMessage: { create: disputeMessageCreate },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-d/chargebacks/disp-1/evidence'

function req(token: string | null = 'tok', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL, {
    method: 'POST',
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/routes-d/chargebacks/[id]/evidence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 with invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/chargebacks/[id]/evidence/route')
    const res = await POST(req(null, { documentUrl: 'http://example.com' }), {
      params: Promise.resolve({ id: 'disp-1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 when chargeback not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    disputeFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/chargebacks/[id]/evidence/route')
    const res = await POST(
      req('tok', { documentUrl: 'http://example.com' }),
      { params: Promise.resolve({ id: 'disp-1' }) },
    )
    expect(res.status).toBe(404)
  })

  it('returns 403 when unauthorized', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    disputeFindUnique.mockResolvedValue({ id: 'disp-1', invoiceId: 'inv-1' })
    invoiceFindFirst.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/chargebacks/[id]/evidence/route')
    const res = await POST(
      req('tok', { documentUrl: 'http://example.com' }),
      { params: Promise.resolve({ id: 'disp-1' }) },
    )
    expect(res.status).toBe(403)
  })

  it('returns 400 when document URL is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    disputeFindUnique.mockResolvedValue({ id: 'disp-1', invoiceId: 'inv-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    const { POST } = await import('@/app/api/routes-d/chargebacks/[id]/evidence/route')
    const res = await POST(req('tok', { description: 'test' }), {
      params: Promise.resolve({ id: 'disp-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid document type', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    disputeFindUnique.mockResolvedValue({ id: 'disp-1', invoiceId: 'inv-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    const { POST } = await import('@/app/api/routes-d/chargebacks/[id]/evidence/route')
    const res = await POST(
      req('tok', { documentUrl: 'http://example.com', documentType: 'invalid' }),
      { params: Promise.resolve({ id: 'disp-1' }) },
    )
    expect(res.status).toBe(400)
  })

  it('uploads evidence successfully', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    disputeFindUnique.mockResolvedValue({ id: 'disp-1', invoiceId: 'inv-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    disputeMessageCreate.mockResolvedValue({
      id: 'msg-1',
      disputeId: 'disp-1',
      senderType: 'seller',
      senderEmail: 'test@example.com',
      message: 'Evidence: receipt',
      attachments: [{ url: 'http://example.com', type: 'receipt' }],
      createdAt: new Date(),
    })

    const { POST } = await import('@/app/api/routes-d/chargebacks/[id]/evidence/route')
    const res = await POST(
      req('tok', { documentUrl: 'http://example.com', documentType: 'receipt' }),
      { params: Promise.resolve({ id: 'disp-1' }) },
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.documentUrl).toBe('http://example.com')
    expect(json.documentType).toBe('receipt')
  })
})
