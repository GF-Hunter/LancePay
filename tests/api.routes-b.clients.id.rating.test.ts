import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const clientFindFirst = vi.fn()
const clientFeedbackFindMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    client: { findFirst: clientFindFirst },
    clientFeedback: { findMany: clientFeedbackFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/clients/c1/rating'

function makeReq(token: string | null = 'Bearer tok') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(URL, { headers })
}

const ctx = { params: Promise.resolve({ id: 'c1' }) }

describe('GET /api/routes-b/clients/[id]/rating', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/clients/[id]/rating/route')
    const res = await GET(makeReq(null), ctx)
    expect(res.status).toBe(401)
  })

  it('returns 404 when client is not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    clientFindFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/clients/[id]/rating/route')
    const res = await GET(makeReq(), ctx)
    expect(res.status).toBe(404)
  })

  it('returns zero rating when client has no feedback', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    clientFindFirst.mockResolvedValue({ id: 'c1', userId: 'user_1' })
    clientFeedbackFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/routes-b/clients/[id]/rating/route')
    const res = await GET(makeReq(), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.averageRating).toBe(0)
    expect(body.totalReviews).toBe(0)
    expect(body.ratings).toHaveLength(0)
  })

  it('calculates average rating correctly', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    clientFindFirst.mockResolvedValue({ id: 'c1', userId: 'user_1' })
    clientFeedbackFindMany.mockResolvedValue([
      { id: 'f1', rating: 5, comment: 'Great', createdAt: '2025-01-01' },
      { id: 'f2', rating: 3, comment: 'OK', createdAt: '2025-01-02' },
      { id: 'f3', rating: 4, comment: 'Good', createdAt: '2025-01-03' },
    ])
    const { GET } = await import('@/app/api/routes-b/clients/[id]/rating/route')
    const res = await GET(makeReq(), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.averageRating).toBe(4)
    expect(body.totalReviews).toBe(3)
    expect(body.ratings).toHaveLength(3)
  })

  it('returns 500 on unexpected error', async () => {
    verifyAuthToken.mockRejectedValue(new Error('db down'))
    const { GET } = await import('@/app/api/routes-b/clients/[id]/rating/route')
    const res = await GET(makeReq(), ctx)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to fetch client rating')
  })
})
