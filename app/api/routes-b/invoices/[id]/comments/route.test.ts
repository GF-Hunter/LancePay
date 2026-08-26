import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    invoiceMessage: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

const params = Promise.resolve({ id: 'inv-1' })
const user = { id: 'user-1', name: 'Jane Freelancer', email: 'jane@example.com' }
const invoice = { id: 'inv-1' }

const comments = [
  {
    id: 'msg-1',
    senderId: 'user-1',
    senderType: 'freelancer',
    senderName: 'Jane Freelancer',
    content: 'Please review the attached scope.',
    attachmentUrl: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  },
]

function makeGetRequest(query = '') {
  return new NextRequest(`http://localhost/api/routes-b/invoices/inv-1/comments${query}`, {
    headers: { authorization: 'Bearer token' },
  })
}

function makePostRequest(body: unknown = { content: 'Looks good, thanks!' }) {
  return new NextRequest('http://localhost/api/routes-b/invoices/inv-1/comments', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: 'privy-1' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never)
  vi.mocked(prisma.invoice.findFirst).mockResolvedValue(invoice as never)
  vi.mocked(prisma.invoiceMessage.findMany).mockResolvedValue(comments as never)
  vi.mocked(prisma.invoiceMessage.count).mockResolvedValue(comments.length as never)
  vi.mocked(prisma.invoiceMessage.create).mockResolvedValue({
    id: 'msg-2',
    senderId: 'user-1',
    senderType: 'freelancer',
    senderName: 'Jane Freelancer',
    content: 'Looks good, thanks!',
    attachmentUrl: null,
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
  } as never)
})

describe('GET /api/routes-b/invoices/[id]/comments', () => {
  it('returns paginated public comments for an owned invoice', async () => {
    const res = await GET(makeGetRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.comments).toHaveLength(1)
    expect(prisma.invoiceMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: 'inv-1', isInternal: false } }),
    )
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/routes-b/invoices/inv-1/comments'),
      { params },
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice is not owned by the user', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await GET(makeGetRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('clamps limit to the maximum allowed page size', async () => {
    await GET(makeGetRequest('?limit=1000'), { params })
    expect(prisma.invoiceMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
  })
})

describe('POST /api/routes-b/invoices/[id]/comments', () => {
  it('creates a public comment on an owned invoice', async () => {
    const res = await POST(makePostRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.comment.content).toBe('Looks good, thanks!')
    expect(prisma.invoiceMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: 'inv-1', isInternal: false, senderId: 'user-1' }),
      }),
    )
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/routes-b/invoices/inv-1/comments', { method: 'POST' }),
      { params },
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice is not owned by the user', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await POST(makePostRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 for missing content', async () => {
    const res = await POST(makePostRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty/whitespace-only content', async () => {
    const res = await POST(makePostRequest({ content: '   ' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for content exceeding the maximum length', async () => {
    const res = await POST(makePostRequest({ content: 'a'.repeat(5001) }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-string attachmentUrl', async () => {
    const res = await POST(makePostRequest({ content: 'hi', attachmentUrl: 123 }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/invoices/inv-1/comments', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: '{not-json',
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(400)
  })

  it('returns 500 and logs when a database call throws', async () => {
    vi.mocked(prisma.invoiceMessage.create).mockRejectedValue(new Error('db down'))
    const res = await POST(makePostRequest(), { params })
    expect(res.status).toBe(500)
  })
})
