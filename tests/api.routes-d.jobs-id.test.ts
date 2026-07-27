import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/routes-d/jobs/[id]/route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    bulkInvoiceJob: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const params = { id: 'job-123' }

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/jobs/job-123', {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
})

describe('GET /api/routes-d/jobs/[id]', () => {
  it('returns job with progress', async () => {
    const job = {
      id: 'job-123',
      status: 'processing',
      totalCount: 10,
      successCount: 6,
      failedCount: 2,
    }
    vi.mocked(prisma.bulkInvoiceJob.findFirst).mockResolvedValue(job as any)

    const res = await GET(makeRequest(), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.job.progress).toBe(80)
    expect(data.job.isComplete).toBe(false)
  })

  it('marks completed jobs as isComplete', async () => {
    const job = {
      id: 'job-123',
      status: 'completed',
      totalCount: 5,
      successCount: 5,
      failedCount: 0,
    }
    vi.mocked(prisma.bulkInvoiceJob.findFirst).mockResolvedValue(job as any)

    const res = await GET(makeRequest(), { params })
    const data = await res.json()

    expect(data.job.isComplete).toBe(true)
    expect(data.job.progress).toBe(100)
  })

  it('returns 404 when job not found', async () => {
    vi.mocked(prisma.bulkInvoiceJob.findFirst).mockResolvedValue(null)

    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-d/jobs/job-123')
    const res = await GET(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when job belongs to another user', async () => {
    vi.mocked(prisma.bulkInvoiceJob.findFirst).mockResolvedValue(null)

    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(404)
  })
})
