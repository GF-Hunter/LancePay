import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/routes-d/admin/balance-adjustments/route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    transaction: { create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockAdmin = { id: 'admin-1', role: 'admin' }
const mockTarget = { id: 'target-1' }
const mockClaims = { userId: 'privy-admin' }

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/admin/balance-adjustments', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
})

it('applies a positive balance adjustment for admin', async () => {
  vi.mocked(prisma.user.findUnique)
    .mockResolvedValueOnce(mockAdmin as any)
    .mockResolvedValueOnce(mockTarget as any)
  const tx = { id: 'tx-1', type: 'deposit', amount: 100 }
  vi.mocked(prisma.transaction.create).mockResolvedValue(tx as any)

  const res = await POST(makeRequest({
    targetUserId: 'target-1',
    amount: 100,
    currency: 'USD',
    reason: 'Correction',
  }))
  const data = await res.json()

  expect(res.status).toBe(201)
  expect(data.transaction).toEqual(tx)
  expect(data.reason).toBe('Correction')
})

it('returns 403 for non-admin users', async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'user' } as any)

  const res = await POST(makeRequest({
    targetUserId: 'target-1',
    amount: 50,
    currency: 'USD',
    reason: 'Test',
  }))
  expect(res.status).toBe(403)
})

it('returns 400 when amount is zero', async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockAdmin as any)

  const res = await POST(makeRequest({
    targetUserId: 'target-1',
    amount: 0,
    currency: 'USD',
    reason: 'Test',
  }))
  expect(res.status).toBe(400)
})

it('returns 400 when reason is missing', async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockAdmin as any)

  const res = await POST(makeRequest({
    targetUserId: 'target-1',
    amount: 50,
    currency: 'USD',
  }))
  expect(res.status).toBe(400)
})

it('returns 404 when target user not found', async () => {
  vi.mocked(prisma.user.findUnique)
    .mockResolvedValueOnce(mockAdmin as any)
    .mockResolvedValueOnce(null)

  const res = await POST(makeRequest({
    targetUserId: 'nonexistent',
    amount: 50,
    currency: 'USD',
    reason: 'Test',
  }))
  expect(res.status).toBe(404)
})

it('returns 401 when unauthenticated', async () => {
  const req = new NextRequest('http://localhost/api/routes-d/admin/balance-adjustments', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  const res = await POST(req)
  expect(res.status).toBe(401)
})
