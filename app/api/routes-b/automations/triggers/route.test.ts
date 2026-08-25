import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>

function makeReq(token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest('http://localhost/api/routes-b/automations/triggers', { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockImplementation((token: string) => Promise.resolve(token ? { userId: 'privy-1' } : null))
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
})

describe('GET /api/routes-b/automations/triggers', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns the list of available triggers on the happy path', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.triggers)).toBe(true)
    expect(json.triggers.length).toBeGreaterThan(0)
    expect(json.triggers[0]).toEqual(
      expect.objectContaining({ value: expect.any(String), label: expect.any(String) }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch automation triggers')
  })
})
