import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const productFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    product: { findMany: productFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/search/products'

function req(token: string | null = 'tok', query = '') {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL + query, { headers: h })
}

describe('GET /api/routes-b/search/products', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/search/products/route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 400 when q is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { GET } = await import('@/app/api/routes-b/search/products/route')
    const res = await GET(req())
    expect(res.status).toBe(400)
  })

  it('returns matching products scoped to the authenticated user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    productFindMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Consulting hour',
        description: 'One hour of consulting',
        priceUsdc: 150,
        unit: 'hour',
        isActive: true,
      },
    ])

    const { GET } = await import('@/app/api/routes-b/search/products/route')
    const res = await GET(req('tok', '?q=consulting'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.products).toHaveLength(1)
    expect(json.products[0].name).toBe('Consulting hour')
    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    )
  })

  it('returns an empty list when nothing matches', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    productFindMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/routes-b/search/products/route')
    const res = await GET(req('tok', '?q=nonexistent'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.products).toHaveLength(0)
  })
})
