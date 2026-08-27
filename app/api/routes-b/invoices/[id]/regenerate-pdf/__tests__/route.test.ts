import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Decimal } from '@prisma/client/runtime/library'

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
import { POST } from '../route'

const mockedRequireScope = vi.mocked(requireScope)
const invoiceDelegate = prisma.invoice as unknown as {
  findFirst: ReturnType<typeof vi.fn>
}

const AUTH = { userId: 'user-1', role: 'freelancer', scopes: ['routes-b:read'] }
const INVOICE_ID = crypto.randomUUID()
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/regenerate-pdf`

function makePost(authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('POST /api/routes-b/invoices/[id]/regenerate-pdf', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequireScope.mockRejectedValue(new RoutesBForbiddenError('missing'))
    const res = await POST(makePost(null), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.message).toBe('Authentication required')
  })

  it('returns 404 when invoice does not exist', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue(null)
    const res = await POST(makePost(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toBe('Invoice not found')
  })

  it('returns 404 when invoice belongs to another user', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue(null)
    const res = await POST(makePost(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(404)
    expect(invoiceDelegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID, userId: 'user-1' },
      })
    )
  })

  it('regenerates PDF and returns invoice with pdfUrl', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const mockInvoice = {
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-001',
      clientName: 'Acme Corp',
      clientEmail: 'client@acme.com',
      description: 'Consulting services',
      amount: new Decimal('1500.00'),
      currency: 'USD',
      status: 'pending',
      dueDate: new Date('2026-09-01T00:00:00Z'),
      createdAt: new Date('2026-08-01T00:00:00Z'),
    }
    invoiceDelegate.findFirst.mockResolvedValue(mockInvoice)

    const res = await POST(makePost(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.invoice).toMatchObject({
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-001',
      clientName: 'Acme Corp',
      clientEmail: 'client@acme.com',
      amount: '1500.00',
      currency: 'USD',
      status: 'pending',
    })
    expect(body.invoice.pdfUrl).toContain(`/invoices/${INVOICE_ID}/invoice-INV-2026-001-`)
    expect(body.invoice.regeneratedAt).toBeDefined()
    expect(new Date(body.invoice.regeneratedAt)).toBeInstanceOf(Date)
  })

  it('handles different invoice statuses', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const mockInvoice = {
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-002',
      clientName: 'Beta Inc',
      clientEmail: 'contact@beta.com',
      description: 'Development work',
      amount: new Decimal('2500.50'),
      currency: 'USD',
      status: 'paid',
      dueDate: new Date('2026-08-15T00:00:00Z'),
      createdAt: new Date('2026-07-15T00:00:00Z'),
    }
    invoiceDelegate.findFirst.mockResolvedValue(mockInvoice)

    const res = await POST(makePost(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.invoice.status).toBe('paid')
    expect(body.invoice.amount).toBe('2500.50')
  })

  it('handles invoices with null dueDate', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const mockInvoice = {
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-003',
      clientName: 'Gamma LLC',
      clientEmail: 'info@gamma.com',
      description: 'Maintenance',
      amount: new Decimal('750.00'),
      currency: 'USD',
      status: 'pending',
      dueDate: null,
      createdAt: new Date('2026-08-20T00:00:00Z'),
    }
    invoiceDelegate.findFirst.mockResolvedValue(mockInvoice)

    const res = await POST(makePost(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.invoice.invoiceNumber).toBe('INV-2026-003')
  })

  it('returns 500 on internal error', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockRejectedValue(new Error('Database error'))

    const res = await POST(makePost(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(500)
    
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL')
    expect(body.error.message).toBe('Failed to regenerate PDF')
  })
})
