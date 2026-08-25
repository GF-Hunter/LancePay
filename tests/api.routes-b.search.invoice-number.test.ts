import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findMany: invoiceFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/search/invoice-number'

function req(token: string | null = 'tok', query = '') {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL + query, { headers: h })
}

describe('GET /api/routes-b/search/invoice-number', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/search/invoice-number/route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 400 when q is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { GET } = await import('@/app/api/routes-b/search/invoice-number/route')
    const res = await GET(req())
    expect(res.status).toBe(400)
  })

  it('returns matching invoices scoped to the authenticated user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindMany.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-001',
        clientEmail: 'client@example.com',
        clientName: 'Client Co',
        amount: 100,
        currency: 'USD',
        status: 'pending',
        createdAt: new Date(),
      },
    ])

    const { GET } = await import('@/app/api/routes-b/search/invoice-number/route')
    const res = await GET(req('tok', '?q=2026-001'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.invoices).toHaveLength(1)
    expect(json.invoices[0].invoiceNumber).toBe('INV-2026-001')
    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    )
  })

  it('returns an empty list when nothing matches', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    invoiceFindMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/routes-b/search/invoice-number/route')
    const res = await GET(req('tok', '?q=nonexistent'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.invoices).toHaveLength(0)
  })
})
