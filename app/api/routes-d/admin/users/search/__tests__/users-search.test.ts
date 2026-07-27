import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GET } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
const BASE_URL = 'http://localhost/api/routes-d/admin/users/search'

function makeGet(query = '', authHeader: string | null = 'Bearer token') {
  return new NextRequest(`${BASE_URL}${query}`, {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('GET /api/routes-d/admin/users/search', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    userDelegate.findMany.mockResolvedValue([])
  })

  it('returns 401 when no auth header', async () => {
    const res = await GET(makeGet('?q=a', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await GET(makeGet('?q=a'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await GET(makeGet('?q=a'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when actor is not admin', async () => {
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1', role: 'freelancer' })
    const res = await GET(makeGet('?q=a'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when q is missing', async () => {
    const res = await GET(makeGet(''))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('q is required')
  })

  it('returns 400 when limit is invalid', async () => {
    const res = await GET(makeGet('?q=a&limit=-1'))
    expect(res.status).toBe(400)
  })

  it('caps limit at 50', async () => {
    await GET(makeGet('?q=a&limit=999'))
    const call = userDelegate.findMany.mock.calls[0][0]
    expect(call.take).toBe(50)
  })

  it('returns 200 with users list', async () => {
    userDelegate.findMany.mockResolvedValue([{ id: 'u1', email: 'a@b.com', name: 'A', role: 'freelancer', createdAt: new Date() }])
    const res = await GET(makeGet('?q=a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.users).toHaveLength(1)
    expect(body.count).toBe(1)
  })
})
