import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../../../../_lib/authz', () => ({
  requireScope: vi.fn(),
  RoutesBForbiddenError: class RoutesBForbiddenError extends Error {
    code = 'FORBIDDEN'
    status = 403
  },
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: { findFirst: vi.fn() },
  },
}))

import { requireScope, RoutesBForbiddenError } from '../../../../../_lib/authz'
import { prisma } from '@/lib/db'
import { GET, POST } from '../route'

const mockedRequireScope = vi.mocked(requireScope)
const invoiceDelegate = prisma.invoice as unknown as {
  findFirst: ReturnType<typeof vi.fn>
}

const AUTH = { userId: 'user-1', role: 'freelancer', scopes: ['routes-b:read'] }
const INVOICE_ID = crypto.randomUUID()
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/payment-methods`

function makeGet(authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

function makePost(body: unknown, authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: authHeader
      ? { authorization: authHeader, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/routes-b/invoices/[id]/payment-methods', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequireScope.mockRejectedValue(new RoutesBForbiddenError('missing'))
    const res = await GET(makeGet(null), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 when invoice does not exist', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue(null)
    const res = await GET(makeGet(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toBe('Invoice not found')
  })

  it('returns 404 when invoice belongs to another user', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue(null)
    const res = await GET(makeGet(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(404)
    expect(invoiceDelegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID, userId: 'user-1' },
      })
    )
  })

  it('returns default payment methods for invoice', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-001',
    })

    const res = await GET(makeGet(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.invoiceId).toBe(INVOICE_ID)
    expect(body.invoiceNumber).toBe('INV-2026-001')
    expect(body.paymentMethods).toBeInstanceOf(Array)
    expect(body.paymentMethods).toContain('stellar_wallet')
    expect(body.availableMethods).toBeInstanceOf(Array)
    expect(body.availableMethods.length).toBeGreaterThan(0)
  })

  it('returns available payment method options', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-002',
    })

    const res = await GET(makeGet(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.availableMethods).toContain('stellar_wallet')
    expect(body.availableMethods).toContain('bank_transfer')
    expect(body.availableMethods).toContain('mobile_money')
  })
})

describe('POST /api/routes-b/invoices/[id]/payment-methods', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequireScope.mockRejectedValue(new RoutesBForbiddenError('missing'))
    const res = await POST(
      makePost({ paymentMethods: ['stellar_wallet'] }, null),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const req = new NextRequest(BASE_URL, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: 'invalid json{',
    })
    const res = await POST(req, { params: { id: INVOICE_ID } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toBe('Invalid JSON body')
  })

  it('returns 400 for missing paymentMethods field', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await POST(makePost({}), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.message).toBe('Validation failed')
  })

  it('returns 400 for empty paymentMethods array', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await POST(
      makePost({ paymentMethods: [] }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.details.fields).toBeDefined()
  })

  it('returns 400 for invalid payment method', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await POST(
      makePost({ paymentMethods: ['invalid_method'] }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for too many payment methods', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const tooManyMethods = Array(11).fill('stellar_wallet')
    const res = await POST(
      makePost({ paymentMethods: tooManyMethods }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.details.fields).toBeDefined()
  })

  it('returns 404 when invoice does not exist', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue(null)
    const res = await POST(
      makePost({ paymentMethods: ['stellar_wallet'] }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when trying to update paid invoice', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-001',
      status: 'paid',
    })
    const res = await POST(
      makePost({ paymentMethods: ['stellar_wallet', 'bank_transfer'] }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toContain('paid invoice')
  })

  it('returns 400 when trying to update cancelled invoice', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-002',
      status: 'cancelled',
    })
    const res = await POST(
      makePost({ paymentMethods: ['stellar_wallet'] }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toContain('cancelled invoice')
  })

  it('updates payment methods successfully', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-003',
      status: 'pending',
    })

    const res = await POST(
      makePost({
        paymentMethods: ['stellar_wallet', 'bank_transfer', 'mobile_money'],
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.invoiceId).toBe(INVOICE_ID)
    expect(body.invoiceNumber).toBe('INV-2026-003')
    expect(body.paymentMethods).toEqual([
      'stellar_wallet',
      'bank_transfer',
      'mobile_money',
    ])
    expect(body.updatedAt).toBeDefined()
    expect(new Date(body.updatedAt)).toBeInstanceOf(Date)
  })

  it('removes duplicate payment methods', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-004',
      status: 'pending',
    })

    const res = await POST(
      makePost({
        paymentMethods: [
          'stellar_wallet',
          'bank_transfer',
          'stellar_wallet',
          'bank_transfer',
        ],
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.paymentMethods).toHaveLength(2)
    expect(body.paymentMethods).toContain('stellar_wallet')
    expect(body.paymentMethods).toContain('bank_transfer')
  })

  it('accepts single payment method', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-005',
      status: 'pending',
    })

    const res = await POST(
      makePost({ paymentMethods: ['cash'] }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.paymentMethods).toEqual(['cash'])
  })

  it('accepts all valid payment method types', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-006',
      status: 'pending',
    })

    const allMethods = [
      'stellar_wallet',
      'bank_transfer',
      'mobile_money',
      'cash',
      'check',
      'wire_transfer',
      'paypal',
      'stripe',
    ]

    const res = await POST(
      makePost({ paymentMethods: allMethods }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.paymentMethods).toEqual(allMethods)
  })
})
