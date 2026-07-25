import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    withdrawalBatch: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const params = { id: 'batch-123' }

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/withdrawals/batch/batch-123', {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
})

describe('GET /api/routes-d/withdrawals/batch/[id]', () => {
  it('returns batch with summary', async () => {
    const mockBatch = {
      id: 'batch-123',
      withdrawals: [
        { status: 'completed', createdAt: new Date() },
        { status: 'pending', createdAt: new Date() },
        { status: 'failed', createdAt: new Date() },
      ],
    }
    vi.mocked(prisma.withdrawalBatch.findFirst).mockResolvedValue(mockBatch as any)

    const res = await GET(makeRequest(), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.summary.total).toBe(3)
    expect(data.summary.completed).toBe(1)
    expect(data.summary.pending).toBe(1)
    expect(data.summary.failed).toBe(1)
  })

  it('returns 404 when batch not found', async () => {
    vi.mocked(prisma.withdrawalBatch.findFirst).mockResolvedValue(null)
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-d/withdrawals/batch/batch-123')
    const res = await GET(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when batch belongs to another user', async () => {
    vi.mocked(prisma.withdrawalBatch.findFirst).mockResolvedValue(null)
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(404)
  })
})
