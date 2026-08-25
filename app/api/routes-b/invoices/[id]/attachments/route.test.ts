import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    invoiceAttachment: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>
const mockFindMany = prisma.invoiceAttachment.findMany as unknown as ReturnType<typeof vi.fn>
const mockCount = prisma.invoiceAttachment.count as unknown as ReturnType<typeof vi.fn>
const mockCreate = prisma.invoiceAttachment.create as unknown as ReturnType<typeof vi.fn>

const INVOICE_ID = 'inv-1'
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/attachments`

function makeGet(query = '', token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

function makePost(body: unknown, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function callGet(id: string, query = '', token: string | null = 'Bearer valid-token') {
  return GET(makeGet(query, token), { params: Promise.resolve({ id }) })
}

function callPost(id: string, body: unknown, token: string | null = 'Bearer valid-token') {
  return POST(makePost(body, token), { params: Promise.resolve({ id }) })
}

const mockAttachment = {
  id: 'attach-1',
  fileName: 'contract.pdf',
  fileUrl: 'https://example.com/files/contract.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  uploadedBy: 'user-1',
  createdAt: new Date('2026-08-01'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockInvoiceFindFirst.mockResolvedValue({ id: INVOICE_ID })
  mockFindMany.mockResolvedValue([mockAttachment])
  mockCount.mockResolvedValue(1)
  mockCreate.mockResolvedValue(mockAttachment)
})

describe('GET /api/routes-b/invoices/[id]/attachments', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callGet(INVOICE_ID, '', null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(404)
  })

  it('returns 200 with paginated attachments on the happy path', async () => {
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.attachments).toHaveLength(1)
    expect(json.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 })
  })

  it('scopes the query to the invoice (ownership check via owned invoice)', async () => {
    await callGet(INVOICE_ID)
    expect(mockInvoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INVOICE_ID, userId: 'user-1' } }),
    )
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: INVOICE_ID } }),
    )
  })

  it('clamps limit to the maximum allowed', async () => {
    const res = await callGet(INVOICE_ID, '?limit=9999')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pagination.limit).toBe(100)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockFindMany.mockRejectedValue(new Error('db unavailable'))
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch invoice attachments')
  })
})

describe('POST /api/routes-b/invoices/[id]/attachments', () => {
  const validBody = {
    fileName: 'contract.pdf',
    fileUrl: 'https://example.com/files/contract.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await callPost(INVOICE_ID, validBody, null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(404)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await callPost(INVOICE_ID, 'not-json')
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when fileName is missing', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, fileName: undefined })
    expect(res.status).toBe(400)
  })

  it('returns 400 when fileUrl is not a valid URL', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, fileUrl: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when mimeType is missing', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, mimeType: undefined })
    expect(res.status).toBe(400)
  })

  it('returns 400 when sizeBytes is not a positive number', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, sizeBytes: -5 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when sizeBytes exceeds the maximum allowed size', async () => {
    const res = await callPost(INVOICE_ID, { ...validBody, sizeBytes: 100 * 1024 * 1024 })
    expect(res.status).toBe(400)
  })

  it('returns 201 and creates the attachment on the happy path', async () => {
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.attachment.fileName).toBe('contract.pdf')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: INVOICE_ID, uploadedBy: 'user-1' }),
      }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockCreate.mockRejectedValue(new Error('db unavailable'))
    const res = await callPost(INVOICE_ID, validBody)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to upload invoice attachment')
  })
})
