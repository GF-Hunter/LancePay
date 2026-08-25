import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    creditNote: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>
const mockFindMany = prisma.creditNote.findMany as unknown as ReturnType<typeof vi.fn>
const mockCount = prisma.creditNote.count as unknown as ReturnType<typeof vi.fn>
const mockCreate = prisma.creditNote.create as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/credit-notes'

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

const mockCreditNote = {
  id: 'cn-1',
  invoiceId: 'inv-1',
  creditNumber: 'CN-ABC123-XYZ789',
  amount: { toString: () => '50' },
  currency: 'USD',
  reason: 'Duplicate charge',
  status: 'issued',
  createdAt: new Date('2026-08-01'),
}

const mockInvoice = { id: 'inv-1', amount: { toString: () => '500' }, currency: 'USD' }

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockFindMany.mockResolvedValue([mockCreditNote])
  mockCount.mockResolvedValue(1)
  mockInvoiceFindFirst.mockResolvedValue(mockInvoice)
  mockCreate.mockResolvedValue({
    id: 'cn-new',
    invoiceId: 'inv-1',
    creditNumber: 'CN-NEW123-ABC456',
    amount: { toString: () => '50' },
    currency: 'USD',
    reason: 'Duplicate charge',
    status: 'issued',
    createdAt: new Date('2026-08-25'),
  })
})

describe('GET /api/routes-b/credit-notes', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGet('', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns 200 with paginated credit notes on the happy path', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.creditNotes).toHaveLength(1)
    expect(json.creditNotes[0].amount).toBe(50)
    expect(json.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 })
  })

  it('scopes the query to the authenticated user (ownership check)', async () => {
    await GET(makeGet())
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('filters by status when provided', async () => {
    await GET(makeGet('?status=voided'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'voided' }) }),
    )
  })

  it('rejects an invalid status with 400', async () => {
    const res = await GET(makeGet('?status=bogus'))
    expect(res.status).toBe(400)
  })

  it('clamps limit to the maximum allowed', async () => {
    const res = await GET(makeGet('?limit=9999'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pagination.limit).toBe(100)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockFindMany.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeGet())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch credit notes')
  })
})

describe('POST /api/routes-b/credit-notes', () => {
  const validBody = { invoiceId: 'inv-1', amount: 50, reason: 'Duplicate charge' }

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(makePost(validBody, null))
    expect(res.status).toBe(401)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await POST(makePost('not-json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when invoiceId is missing', async () => {
    const res = await POST(makePost({ ...validBody, invoiceId: undefined }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reason is missing', async () => {
    const res = await POST(makePost({ ...validBody, reason: undefined }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is not a positive number', async () => {
    const res = await POST(makePost({ ...validBody, amount: -10 }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(404)
  })

  it('returns 400 when amount exceeds the invoice total', async () => {
    const res = await POST(makePost({ ...validBody, amount: 1000 }))
    expect(res.status).toBe(400)
  })

  it('creates a credit note and returns 201', async () => {
    const res = await POST(makePost(validBody))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.creditNote.id).toBe('cn-new')
    expect(json.creditNote.amount).toBe(50)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          invoiceId: 'inv-1',
          amount: 50,
          reason: 'Duplicate charge',
          status: 'issued',
        }),
      }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockCreate.mockRejectedValue(new Error('db unavailable'))
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to create credit note')
  })
})
