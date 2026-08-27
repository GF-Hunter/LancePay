import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindUnique = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findUnique: invoiceFindUnique },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/invoice-number-sequences/reserve'

function req(token: string | null = 'tok', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  if (body !== undefined) h.set('content-type', 'application/json')
  return new NextRequest(URL, {
    method: 'POST',
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/routes-b/invoice-number-sequences/reserve (#1121)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('./route')
    const res = await POST(req(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('./route')
    const res = await POST(req('invalid'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user is not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue(null)
    const { POST } = await import('./route')
    const res = await POST(req())
    expect(res.status).toBe(404)
  })

  it('returns 400 when prefix format is invalid', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { POST } = await import('./route')
    const res = await POST(req('tok', { prefix: 'INVALID PREFIX WITH SPACES' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/prefix/)
  })

  it('reserves a default invoice number successfully', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindUnique.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(req('tok', {}))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.invoiceNumber).toMatch(/^INV-/)
    expect(json.prefix).toBe('INV')
    expect(json.userId).toBe('user-1')
    expect(json.reservedAt).toBeDefined()
  })

  it('reserves an invoice number with custom prefix', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindUnique.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(req('tok', { prefix: 'ACME' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.invoiceNumber).toMatch(/^ACME-/)
    expect(json.prefix).toBe('ACME')
  })
})
