import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindFirst = vi.fn()
const invoiceMessageFindMany = vi.fn()
const invoiceMessageCreate = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findFirst: invoiceFindFirst },
    invoiceMessage: {
      findMany: invoiceMessageFindMany,
      create: invoiceMessageCreate,
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/invoices/inv-1/notes'

function req(method = 'GET', token: string | null = 'tok', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  if (body) h.set('content-type', 'application/json')
  return new NextRequest(URL, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/routes-b/invoices/[id]/notes (#1123)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/notes/route')
    const res = await GET(req('GET', null), ctx('inv-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user is not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/notes/route')
    const res = await GET(req('GET'), ctx('inv-1'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when invoice not found or not owned', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/notes/route')
    const res = await GET(req('GET'), ctx('inv-1'))
    expect(res.status).toBe(404)
  })

  it('returns list of internal notes on the invoice', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', name: 'John Doe' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    invoiceMessageFindMany.mockResolvedValue([
      {
        id: 'msg-1',
        invoiceId: 'inv-1',
        senderId: 'user-1',
        senderType: 'freelancer',
        senderName: 'John Doe',
        content: 'Client requested wire instructions update',
        attachmentUrl: null,
        isInternal: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ])

    const { GET } = await import('@/app/api/routes-b/invoices/[id]/notes/route')
    const res = await GET(req('GET'), ctx('inv-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.notes).toHaveLength(1)
    expect(json.notes[0].content).toBe('Client requested wire instructions update')
    expect(json.notes[0].isInternal).toBe(true)
  })
})

describe('POST /api/routes-b/invoices/[id]/notes (#1123)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/routes-b/invoices/[id]/notes/route')
    const res = await POST(req('POST', null, { content: 'Test note' }), ctx('inv-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when content is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })

    const { POST } = await import('@/app/api/routes-b/invoices/[id]/notes/route')
    const res = await POST(req('POST', 'tok', {}), ctx('inv-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('content is required and must be a non-empty string')
  })

  it('returns 400 when content is whitespace only', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })

    const { POST } = await import('@/app/api/routes-b/invoices/[id]/notes/route')
    const res = await POST(req('POST', 'tok', { content: '   ' }), ctx('inv-1'))
    expect(res.status).toBe(400)
  })

  it('creates an internal note successfully', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', name: 'John Doe', email: 'john@example.com' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    invoiceMessageCreate.mockResolvedValue({
      id: 'msg-1',
      invoiceId: 'inv-1',
      senderId: 'user-1',
      senderType: 'freelancer',
      senderName: 'John Doe',
      content: 'Follow up on payment next week',
      attachmentUrl: null,
      isInternal: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })

    const { POST } = await import('@/app/api/routes-b/invoices/[id]/notes/route')
    const res = await POST(req('POST', 'tok', { content: 'Follow up on payment next week' }), ctx('inv-1'))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.note.content).toBe('Follow up on payment next week')
    expect(json.note.isInternal).toBe(true)
    expect(invoiceMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 'inv-1',
          senderId: 'user-1',
          content: 'Follow up on payment next week',
          isInternal: true,
        }),
      }),
    )
  })
})
