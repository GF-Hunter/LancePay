import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/audit', () => ({
  extractRequestMetadata: vi.fn(() => ({ ip: '127.0.0.1', userAgent: 'vitest' })),
  logAuditEvent: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import { prisma } from '@/lib/db'

const params = Promise.resolve({ id: 'inv-1' })
const user = { id: 'user-1', privyId: 'privy-1' }
const invoice = {
  id: 'inv-1',
  userId: 'user-1',
  status: 'pending',
  invoiceNumber: 'INV-001',
  amount: 120,
  currency: 'USDC',
}

function makeRequest(body: unknown = { reason: 'Duplicate invoice' }) {
  return new NextRequest('http://localhost/api/routes-b/invoices/inv-1/void', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: 'privy-1' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never)
  vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as never)
  vi.mocked(prisma.invoice.update).mockResolvedValue({
    id: 'inv-1',
    status: 'voided',
    invoiceNumber: 'INV-001',
    amount: 120,
    currency: 'USDC',
    cancelledAt: new Date('2026-08-01'),
    cancellationReason: 'Duplicate invoice',
    updatedAt: new Date('2026-08-01'),
  } as never)
})

describe('POST /api/routes-b/invoices/[id]/void', () => {
  it('voids an owned invoice and records an audit event', async () => {
    const res = await POST(makeRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.invoice.status).toBe('voided')
    expect(body.invoice.cancellationReason).toBe('Duplicate invoice')
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ status: 'voided', cancellationReason: 'Duplicate invoice' }),
      }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      'inv-1',
      'invoice.voided',
      'user-1',
      expect.objectContaining({ previousStatus: 'pending', nextStatus: 'voided', reason: 'Duplicate invoice' }),
    )
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/routes-b/invoices/inv-1/void', { method: 'POST' }),
      { params },
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice is missing', async () => {
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 403 when the authenticated user does not own the invoice', async () => {
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ ...invoice, userId: 'other-user' } as never)
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(403)
  })

  it('returns 400 when reason is missing', async () => {
    const res = await POST(makeRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('returns 422 when the invoice is already paid', async () => {
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ ...invoice, status: 'paid' } as never)
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(422)
  })
})
