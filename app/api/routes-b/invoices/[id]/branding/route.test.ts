import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindFirst = vi.fn()
const brandingFindUnique = vi.fn()
const brandingUpsert = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findFirst: invoiceFindFirst },
    brandingSettings: {
      findUnique: brandingFindUnique,
      upsert: brandingUpsert,
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/invoices/inv-1/branding'

function req(method = 'GET', token: string | null = 'tok', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  if (body !== undefined) h.set('content-type', 'application/json')
  return new NextRequest(URL, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/routes-b/invoices/[id]/branding (#1119)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('./route')
    const res = await GET(req('GET', null), ctx('inv-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user is not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req('GET'), ctx('inv-1'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when invoice not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req('GET'), ctx('inv-1'))
    expect(res.status).toBe(404)
  })

  it('returns null branding when none configured', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    brandingFindUnique.mockResolvedValue(null)

    const { GET } = await import('./route')
    const res = await GET(req('GET'), ctx('inv-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.branding).toBeNull()
    expect(json.invoiceId).toBe('inv-1')
  })

  it('returns branding settings for invoice owner', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    brandingFindUnique.mockResolvedValue({
      id: 'b-1',
      logoUrl: 'https://example.com/logo.png',
      primaryColor: '#6366f1',
      footerText: 'Thank you!',
      signatureUrl: null,
      updatedAt: new Date(),
    })

    const { GET } = await import('./route')
    const res = await GET(req('GET'), ctx('inv-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.branding.primaryColor).toBe('#6366f1')
    expect(json.branding.logoUrl).toBe('https://example.com/logo.png')
  })
})

describe('PATCH /api/routes-b/invoices/[id]/branding (#1119)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(req('PATCH', null, { primaryColor: '#123456' }), ctx('inv-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when primaryColor is invalid hex', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })

    const { PATCH } = await import('./route')
    const res = await PATCH(req('PATCH', 'tok', { primaryColor: 'blue' }), ctx('inv-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/primaryColor/)
  })

  it('returns 400 when logoUrl is invalid URL', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })

    const { PATCH } = await import('./route')
    const res = await PATCH(req('PATCH', 'tok', { logoUrl: 'not-a-url' }), ctx('inv-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when body is empty', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })

    const { PATCH } = await import('./route')
    const res = await PATCH(req('PATCH', 'tok', {}), ctx('inv-1'))
    expect(res.status).toBe(400)
  })

  it('updates branding settings successfully', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1' })
    brandingUpsert.mockResolvedValue({
      id: 'b-1',
      logoUrl: 'https://example.com/logo.png',
      primaryColor: '#123456',
      footerText: 'Payment due in 30 days',
      signatureUrl: null,
      updatedAt: new Date(),
    })

    const { PATCH } = await import('./route')
    const res = await PATCH(
      req('PATCH', 'tok', {
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#123456',
        footerText: 'Payment due in 30 days',
      }),
      ctx('inv-1'),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.branding.primaryColor).toBe('#123456')
    expect(json.branding.footerText).toBe('Payment due in 30 days')
  })
})
