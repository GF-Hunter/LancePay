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

const URL = 'http://localhost/api/routes-b/invoices/inv-1/mentions'

function req(token: string | null = 'tok', method: string = 'GET', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/routes-b/invoices/[id]/mentions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 with invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/mentions/route')
    const res = await GET(req(), { params: Promise.resolve({ id: 'inv-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/mentions/route')
    const res = await GET(req(), { params: Promise.resolve({ id: 'inv-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns mentions for invoice', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1' })
    invoiceMessageFindMany.mockResolvedValue([
      {
        id: 'msg-1',
        senderId: 'u1',
        senderType: 'freelancer',
        senderName: 'John',
        content: 'Test mention',
        attachmentUrl: null,
        isInternal: true,
        createdAt: new Date(),
      },
    ])

    const { GET } = await import('@/app/api/routes-b/invoices/[id]/mentions/route')
    const res = await GET(req(), { params: Promise.resolve({ id: 'inv-1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mentions).toHaveLength(1)
  })
})

describe('POST /api/routes-b/invoices/[id]/mentions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 with invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-b/invoices/[id]/mentions/route')
    const res = await POST(req(null, 'POST', { content: 'test' }), {
      params: Promise.resolve({ id: 'inv-1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-b/invoices/[id]/mentions/route')
    const res = await POST(req('tok', 'POST', { content: 'test' }), {
      params: Promise.resolve({ id: 'inv-1' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when content is empty', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', name: 'John', email: 'j@test.com' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    const { POST } = await import('@/app/api/routes-b/invoices/[id]/mentions/route')
    const res = await POST(req('tok', 'POST', { content: '' }), {
      params: Promise.resolve({ id: 'inv-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when content exceeds max length', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', name: 'John', email: 'j@test.com' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    const { POST } = await import('@/app/api/routes-b/invoices/[id]/mentions/route')
    const res = await POST(req('tok', 'POST', { content: 'a'.repeat(5001) }), {
      params: Promise.resolve({ id: 'inv-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('creates mention successfully', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', name: 'John', email: 'j@test.com' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    invoiceMessageCreate.mockResolvedValue({
      id: 'msg-1',
      invoiceId: 'inv-1',
      senderId: 'user-1',
      senderType: 'freelancer',
      senderName: 'John',
      content: 'Test mention',
      attachmentUrl: null,
      isInternal: true,
      createdAt: new Date(),
    })

    const { POST } = await import('@/app/api/routes-b/invoices/[id]/mentions/route')
    const res = await POST(req('tok', 'POST', { content: 'Test mention' }), {
      params: Promise.resolve({ id: 'inv-1' }),
    })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.content).toBe('Test mention')
  })
})
