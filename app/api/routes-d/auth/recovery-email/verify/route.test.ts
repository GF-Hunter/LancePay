import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    recoveryEmailVerification: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockPending = { id: 'ver-1', email: 'recover@example.com', code: 'ABC123', verified: false }

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/auth/recovery-email/verify', {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
  vi.mocked(prisma.recoveryEmailVerification.findFirst).mockResolvedValue(mockPending as any)
  vi.mocked(prisma.$transaction).mockResolvedValue([])
})

describe('POST /api/routes-d/auth/recovery-email/verify', () => {
  it('verifies recovery email with valid code', async () => {
    const res = await POST(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.message).toContain('verified')
  })

  it('returns 400 when code is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when code is invalid or expired', async () => {
    vi.mocked(prisma.recoveryEmailVerification.findFirst).mockResolvedValue(null)
    const res = await POST(makeRequest({ code: 'WRONG' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(new NextRequest('http://localhost/api/routes-d/auth/recovery-email/verify', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(404)
  })
})
