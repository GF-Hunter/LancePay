import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockToken = { id: 'tok-1', token: 'RESETTOKEN', used: false }

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/auth/password/reset-confirm', {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
  vi.mocked(prisma.passwordResetToken.findFirst).mockResolvedValue(mockToken as any)
  vi.mocked(prisma.$transaction).mockResolvedValue([])
})

describe('POST /api/routes-d/auth/password/reset-confirm', () => {
  it('resets password with valid token and new password', async () => {
    const res = await POST(makeRequest({ token: 'RESETTOKEN', newPassword: 'newpassword123' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.message).toContain('reset')
  })

  it('returns 400 when token missing', async () => {
    const res = await POST(makeRequest({ newPassword: 'newpassword123' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when password too short', async () => {
    const res = await POST(makeRequest({ token: 'RESETTOKEN', newPassword: 'short' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reset token invalid or expired', async () => {
    vi.mocked(prisma.passwordResetToken.findFirst).mockResolvedValue(null)
    const res = await POST(makeRequest({ token: 'BADTOKEN', newPassword: 'newpassword123' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(new NextRequest('http://localhost/api/routes-d/auth/password/reset-confirm', { method: 'POST' }))
    expect(res.status).toBe(401)
  })
})
