import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn() },
    refund: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  extractRequestMetadata: vi.fn().mockReturnValue({}),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindUnique = prisma.invoice.findUnique as unknown as ReturnType<typeof vi.fn>
const mockRefundFindMany = prisma.refund.findMany as unknown as ReturnType<typeof vi.fn>
const mockRefundCreate = prisma.refund.create as unknown as ReturnType<typeof vi.fn>
const mockLogAuditEvent = logAuditEvent as unknown as ReturnType<typeof vi.fn>

const INVOICE_ID = 'inv-1'

function makeGet(id: string, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`http://localhost/api/routes-b/invoices/${id}/refunds`, { headers })
}

function callGet(id: string, token: string | null = 'Bearer valid-token') {
  return GET(makeGet(id, token), { params: Promise.resolve({ id }) })
}

function makePost(id: string, body: unknown, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(`http://localhost/api/routes-b/invoices/${id}/refunds`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function callPost(id: string, body: unknown, token: string | null = 'Bearer valid-token') {
  return POST(makePost(id, body, token), { params: Promise.resolve({ id }) })
}

const mockInvoice = {
  id: INVOICE_ID,
  userId: 'user-1',
  status: 'paid',
  amount: { toString: () => '500' },
  currency: 'USD',
}

const mockRefund = {
  id: 'refund-1',
  invoiceId: INVOICE_ID,
  amount: { toString: () => '50' },
  currency: 'USD',
  reason: 'Customer request',
  status: 'pending',
  createdAt: new Date('2026-08-01'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockInvoiceFindUnique.mockResolvedValue(mockInvoice)
  mockRefundFindMany.mockResolvedValue([mockRefund])
  mockRefundCreate.mockResolvedValue({
    id: 'refund-new',
    invoiceId: INVOICE_ID,
    amount: { toString: () => '50' },
    currency: 'USD',
    reason: 'Customer request',
    status: 'pending',
    createdAt: new Date('2026-08-25'),
  })
})

describe('GET /api/routes-b/invoices/[id]/refunds', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callGet(INVOICE_ID, null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist', async () => {
    mockInvoiceFindUnique.mockResolvedValue(null)
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(404)
  })

  it('returns 403 when the invoice belongs to another user', async () => {
    mockInvoiceFindUnique.mockResolvedValue({ ...mockInvoice, userId: 'someone-else' })
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(403)
  })

  it('returns 200 with the refund list on the happy path', async () => {
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.refunds).toHaveLength(1)
    expect(json.refunds[0].amount).toBe(50)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockRefundFindMany.mockRejectedValue(new Error('db unavailable'))
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(500)
  })
})

describe('POST /api/routes-b/invoices/[id]/refunds', () => {
  const validBody = { amount: 50, reason: 'Customer request' }

  it('returns 401 when unauthenticated', async () => {
    const res = await callPost(INVOICE_ID, validBody, null)
    expect(res.status).toBe(401)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await callPost(INVOICE_ID, 'not-json')
    expect(res.status).toBe(400)
  })

  it('returns 400 when reason is missing', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, reason: undefined })
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is not a positive number', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, amount: -10 })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the invoice does not exist', async () => {
    mockInvoiceFindUnique.mockResolvedValue(null)
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(404)
  })

  it('returns 403 when the invoice belongs to another user', async () => {
    mockInvoiceFindUnique.mockResolvedValue({ ...mockInvoice, userId: 'someone-else' })
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(403)
  })

  it('returns 422 when the invoice status blocks refunds', async () => {
    mockInvoiceFindUnique.mockResolvedValue({ ...mockInvoice, status: 'pending' })
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(422)
  })

  it('returns 400 when amount exceeds the invoice total', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, amount: 1000 })
    expect(res.status).toBe(400)
  })

  it('creates a refund, logs an audit event, and returns 201 on the happy path', async () => {
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.refund.amount).toBe(50)
    expect(json.refund.status).toBe('pending')
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      INVOICE_ID,
      'invoice.refund_issued',
      'user-1',
      expect.objectContaining({ amount: 50 }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockRefundCreate.mockRejectedValue(new Error('db unavailable'))
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(500)
  })
})
