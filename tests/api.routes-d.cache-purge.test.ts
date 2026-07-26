import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
  },
}))

const BASE_URL = 'http://localhost/api/routes-d/cache/purge'

function makeRequest(body: any = {}, token: string | null = 'valid-token') {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('POST /api/routes-d/cache/purge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 if authorization header is missing', async () => {
    const { POST } = await import('@/app/api/routes-d/cache/purge/route')
    const res = await POST(makeRequest({}, null))
    expect(res.status).toBe(401)
  })

  it('returns 404 if user is not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue(null)

    const { POST } = await import('@/app/api/routes-d/cache/purge/route')
    const res = await POST(makeRequest({ tags: ['invoices'] }))
    expect(res.status).toBe(404)
  })

  it('returns 400 if body missing required purge scope', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })

    const { POST } = await import('@/app/api/routes-d/cache/purge/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 200 on successful tag cache purge', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })

    const { POST } = await import('@/app/api/routes-d/cache/purge/route')
    const res = await POST(makeRequest({ tags: ['invoices', 'users'] }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.purgedCount).toBe(2)
  })
})
