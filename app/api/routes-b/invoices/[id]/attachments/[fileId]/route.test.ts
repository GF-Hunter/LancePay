import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    invoiceAttachment: { findFirst: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>
const mockAttachmentFindFirst = prisma.invoiceAttachment.findFirst as unknown as ReturnType<
  typeof vi.fn
>
const mockDelete = prisma.invoiceAttachment.delete as unknown as ReturnType<typeof vi.fn>

const INVOICE_ID = 'inv-1'
const FILE_ID = 'attach-1'
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/attachments/${FILE_ID}`

function makeDelete(token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, { method: 'DELETE', headers })
}

function callDelete(id: string, fileId: string, token: string | null = 'Bearer valid-token') {
  return DELETE(makeDelete(token), { params: Promise.resolve({ id, fileId }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockInvoiceFindFirst.mockResolvedValue({ id: INVOICE_ID })
  mockAttachmentFindFirst.mockResolvedValue({ id: FILE_ID })
  mockDelete.mockResolvedValue({ id: FILE_ID })
})

describe('DELETE /api/routes-b/invoices/[id]/attachments/[fileId]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callDelete(INVOICE_ID, FILE_ID, null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await callDelete(INVOICE_ID, FILE_ID)
    expect(res.status).toBe(404)
  })

  it('returns 404 when the attachment does not exist on the invoice', async () => {
    mockAttachmentFindFirst.mockResolvedValue(null)
    const res = await callDelete(INVOICE_ID, FILE_ID)
    expect(res.status).toBe(404)
  })

  it('scopes the attachment lookup to the invoice', async () => {
    await callDelete(INVOICE_ID, FILE_ID)
    expect(mockAttachmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: FILE_ID, invoiceId: INVOICE_ID } }),
    )
  })

  it('returns 204 and deletes the attachment on the happy path', async () => {
    const res = await callDelete(INVOICE_ID, FILE_ID)
    expect(res.status).toBe(204)
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: FILE_ID } })
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockDelete.mockRejectedValue(new Error('db unavailable'))
    const res = await callDelete(INVOICE_ID, FILE_ID)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to remove invoice attachment')
  })
})
