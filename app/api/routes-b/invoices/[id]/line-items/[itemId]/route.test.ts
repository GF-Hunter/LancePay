import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH, DELETE } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    invoiceLineItem: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>
const mockLineItemFindFirst = prisma.invoiceLineItem.findFirst as unknown as ReturnType<typeof vi.fn>
const mockUpdate = prisma.invoiceLineItem.update as unknown as ReturnType<typeof vi.fn>
const mockDelete = prisma.invoiceLineItem.delete as unknown as ReturnType<typeof vi.fn>

const INVOICE_ID = 'inv-1'
const ITEM_ID = 'item-1'
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/line-items/${ITEM_ID}`

function makeRequest(
  method: 'PATCH' | 'DELETE',
  body: unknown,
  token: string | null = 'Bearer valid-token',
) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new NextRequest(BASE_URL, init)
}

function callPatch(
  id: string,
  itemId: string,
  body: unknown,
  token: string | null = 'Bearer valid-token',
) {
  return PATCH(makeRequest('PATCH', body, token), { params: Promise.resolve({ id, itemId }) })
}

function callDelete(id: string, itemId: string, token: string | null = 'Bearer valid-token') {
  return DELETE(makeRequest('DELETE', undefined, token), {
    params: Promise.resolve({ id, itemId }),
  })
}

const mockLineItem = {
  id: ITEM_ID,
  description: 'Design consultation',
  quantity: 2,
  unitPrice: 150,
  position: 0,
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockInvoiceFindFirst.mockResolvedValue({ id: INVOICE_ID, status: 'pending' })
  mockLineItemFindFirst.mockResolvedValue({ id: ITEM_ID })
  mockUpdate.mockResolvedValue(mockLineItem)
  mockDelete.mockResolvedValue(mockLineItem)
})

describe('PATCH /api/routes-b/invoices/[id]/line-items/[itemId]', () => {
  const validBody = { description: 'Updated description' }

  it('returns 401 when unauthenticated', async () => {
    const res = await callPatch(INVOICE_ID, ITEM_ID, validBody, null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await callPatch(INVOICE_ID, ITEM_ID, validBody)
    expect(res.status).toBe(404)
  })

  it('returns 404 when the line item does not exist on the invoice', async () => {
    mockLineItemFindFirst.mockResolvedValue(null)
    const res = await callPatch(INVOICE_ID, ITEM_ID, validBody)
    expect(res.status).toBe(404)
  })

  it('returns 422 when the invoice is already paid', async () => {
    mockInvoiceFindFirst.mockResolvedValue({ id: INVOICE_ID, status: 'paid' })
    const res = await callPatch(INVOICE_ID, ITEM_ID, validBody)
    expect(res.status).toBe(422)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await callPatch(INVOICE_ID, ITEM_ID, 'not-json')
    expect(res.status).toBe(400)
  })

  it('returns 400 when no updatable fields are provided', async () => {
    const res = await callPatch(INVOICE_ID, ITEM_ID, {})
    expect(res.status).toBe(400)
  })

  it('returns 400 when description is an empty string', async () => {
    const res = await callPatch(INVOICE_ID, ITEM_ID, { description: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when quantity is not positive', async () => {
    const res = await callPatch(INVOICE_ID, ITEM_ID, { quantity: -1 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when unitPrice is negative', async () => {
    const res = await callPatch(INVOICE_ID, ITEM_ID, { unitPrice: -5 })
    expect(res.status).toBe(400)
  })

  it('returns 200 and updates the line item on the happy path', async () => {
    const res = await callPatch(INVOICE_ID, ITEM_ID, validBody)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.lineItem.id).toBe(ITEM_ID)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ITEM_ID },
        data: { description: 'Updated description' },
      }),
    )
  })

  it('allows partial updates of only quantity', async () => {
    const res = await callPatch(INVOICE_ID, ITEM_ID, { quantity: 5 })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 5 } }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockUpdate.mockRejectedValue(new Error('db unavailable'))
    const res = await callPatch(INVOICE_ID, ITEM_ID, validBody)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to update invoice line item')
  })
})

describe('DELETE /api/routes-b/invoices/[id]/line-items/[itemId]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callDelete(INVOICE_ID, ITEM_ID, null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await callDelete(INVOICE_ID, ITEM_ID)
    expect(res.status).toBe(404)
  })

  it('returns 404 when the line item does not exist on the invoice', async () => {
    mockLineItemFindFirst.mockResolvedValue(null)
    const res = await callDelete(INVOICE_ID, ITEM_ID)
    expect(res.status).toBe(404)
  })

  it('returns 422 when the invoice is already paid', async () => {
    mockInvoiceFindFirst.mockResolvedValue({ id: INVOICE_ID, status: 'paid' })
    const res = await callDelete(INVOICE_ID, ITEM_ID)
    expect(res.status).toBe(422)
  })

  it('returns 204 and deletes the line item on the happy path (including the last remaining item)', async () => {
    const res = await callDelete(INVOICE_ID, ITEM_ID)
    expect(res.status).toBe(204)
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: ITEM_ID } })
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockDelete.mockRejectedValue(new Error('db unavailable'))
    const res = await callDelete(INVOICE_ID, ITEM_ID)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to delete invoice line item')
  })
})
