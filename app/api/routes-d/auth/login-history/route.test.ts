import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userSession: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/auth/login-history', {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
})

describe('GET /api/routes-d/auth/login-history', () => {
  it('returns login history ordered by most recent', async () => {
    const sessions = [
      { id: 'sess-2', issuedAt: new Date('2026-07-20'), lastSeenAt: new Date('2026-07-20') },
      { id: 'sess-1', issuedAt: new Date('2026-07-10'), lastSeenAt: new Date('2026-07-10') },
    ]
    vi.mocked(prisma.userSession.findMany).mockResolvedValue(sessions as any)

    const res = await GET(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.history).toHaveLength(2)
    expect(prisma.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: { issuedAt: 'desc' },
      }),
    )
  })

  it('returns an empty list when the user has no session history', async () => {
    vi.mocked(prisma.userSession.findMany).mockResolvedValue([] as any)

    const res = await GET(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.history).toEqual([])
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(new NextRequest('http://localhost/api/routes-d/auth/login-history'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null as any)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user record is missing', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any)
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 500 when the database call fails', async () => {
    vi.mocked(prisma.userSession.findMany).mockRejectedValue(new Error('db down'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
