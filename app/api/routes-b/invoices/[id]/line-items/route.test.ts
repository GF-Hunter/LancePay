import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    invoiceLineItem: { findFirst: vi.fn(), create: vi.fn() },
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
const mockCreate = prisma.invoiceLineItem.create as unknown as ReturnType<typeof vi.fn>

const INVOICE_ID = 'inv-1'
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/line-items`

function makePost(body: unknown, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function callPost(id: string, body: unknown, token: string | null = 'Bearer valid-token') {
  return POST(makePost(body, token), { params: Promise.resolve({ id }) })
}

const mockLineItem = {
  id: 'item-1',
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
  mockLineItemFindFirst.mockResolvedValue(null)
  mockCreate.mockResolvedValue(mockLineItem)
})

describe('POST /api/routes-b/invoices/[id]/line-items', () => {
  const validBody = { description: 'Design consultation', quantity: 2, unitPrice: 150 }

  it('returns 401 when unauthenticated', async () => {
    const res = await callPost(INVOICE_ID, validBody, null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(404)
  })

  it('returns 422 when the invoice is already paid', async () => {
    mockInvoiceFindFirst.mockResolvedValue({ id: INVOICE_ID, status: 'paid' })
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(422)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await callPost(INVOICE_ID, 'not-json')
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when description is missing', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, description: undefined })
    expect(res.status).toBe(400)
  })

  it('returns 400 when description exceeds the maximum length', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, description: 'a'.repeat(501) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when quantity is not a positive number', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, quantity: 0 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when unitPrice is negative', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, unitPrice: -1 })
    expect(res.status).toBe(400)
  })

  it('returns 201 and creates the line item at position 0 when none exist', async () => {
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.lineItem.description).toBe('Design consultation')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: INVOICE_ID, position: 0 }),
      }),
    )
  })

  it('appends the new line item after the highest existing position', async () => {
    mockLineItemFindFirst.mockResolvedValue({ position: 3 })
    await callPost(INVOICE_ID, validBody)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 4 }) }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockCreate.mockRejectedValue(new Error('db unavailable'))
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to add invoice line item')
  })
})
