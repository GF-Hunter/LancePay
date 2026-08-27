import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    emailBounce: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockBounce = {
  id: 'bounce-1',
  email: 'bounced@example.com',
  bounceType: 'hard',
  reason: 'Mailbox full',
  userId: 'user-1',
  createdAt: new Date(),
}

function makeGet(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/routes-b/email-bounces')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url, { headers: { authorization: 'Bearer token' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  const delegate = (prisma as unknown as { emailBounce: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> } }).emailBounce
  if (delegate) {
    vi.mocked(delegate.findMany).mockResolvedValue([mockBounce] as never)
    vi.mocked(delegate.count).mockResolvedValue(1)
  }
})

describe('GET /api/routes-b/email-bounces', () => {
  it('returns email bounces list', async () => {
    const res = await GET(makeGet())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data.bounces)).toBe(true)
    expect(typeof data.total).toBe('number')
  })

  it('filters by bounce type when parameter is provided', async () => {
    const res = await GET(makeGet({ type: 'hard' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data.bounces)).toBe(true)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/email-bounces')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
