import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    job: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1', role: 'user', email: 'user@test.com' }
const mockAdmin = { id: 'admin-1', role: 'admin', email: 'admin@test.com' }
const mockClaims = { userId: 'privy-1' }

const pendingJob = { id: 'job-1', userId: 'user-1', status: 'pending', type: 'transfer' }
const queuedJob = { id: 'job-2', userId: 'user-1', status: 'queued', type: 'transfer' }
const runningJob = { id: 'job-3', userId: 'user-1', status: 'running', type: 'transfer' }
const completedJob = { id: 'job-4', userId: 'user-1', status: 'completed', type: 'transfer' }
const cancelledResult = { id: 'job-1', type: 'transfer', status: 'cancelled', cancelledAt: new Date() }

function makeRequest(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost/api/routes-d/jobs/${id}/cancel`, {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
  })
  const ctx = { params: Promise.resolve({ id }) }
  return [req, ctx]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
  vi.mocked(prisma.job.findUnique).mockResolvedValue(pendingJob as any)
  vi.mocked(prisma.job.update).mockResolvedValue(cancelledResult as any)
})

describe('POST /api/routes-d/jobs/[id]/cancel', () => {
  it('cancels a pending job owned by the user', async () => {
    const [req, ctx] = makeRequest('job-1')
    const res = await POST(req, ctx)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.job.status).toBe('cancelled')
  })

  it('cancels a queued job', async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValue(queuedJob as any)
    const [req, ctx] = makeRequest('job-2')
    const res = await POST(req, ctx)
    expect(res.status).toBe(200)
  })

  it('returns 409 when job is in a non-cancellable status', async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValue(runningJob as any)
    const [req, ctx] = makeRequest('job-3')
    const res = await POST(req, ctx)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.cancellableStatuses).toBeDefined()
  })

  it('returns 409 when job is completed', async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValue(completedJob as any)
    const [req, ctx] = makeRequest('job-4')
    const res = await POST(req, ctx)
    expect(res.status).toBe(409)
  })

  it('returns 404 when job not found', async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValue(null)
    const [req, ctx] = makeRequest('job-99')
    const res = await POST(req, ctx)
    expect(res.status).toBe(404)
  })

  it('returns 403 when user does not own the job and is not admin', async () => {
    const otherUserJob = { ...pendingJob, userId: 'other-user' }
    vi.mocked(prisma.job.findUnique).mockResolvedValue(otherUserJob as any)
    const [req, ctx] = makeRequest('job-1')
    const res = await POST(req, ctx)
    expect(res.status).toBe(403)
  })

  it('allows admin to cancel any job', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockAdmin as any)
    const otherUserJob = { ...pendingJob, userId: 'other-user' }
    vi.mocked(prisma.job.findUnique).mockResolvedValue(otherUserJob as any)
    const [req, ctx] = makeRequest('job-1')
    const res = await POST(req, ctx)
    expect(res.status).toBe(200)
  })

  it('returns 401 when no token', async () => {
    const req = new NextRequest('http://localhost/api/routes-d/jobs/job-1/cancel', { method: 'POST' })
    const ctx = { params: Promise.resolve({ id: 'job-1' }) }
    const res = await POST(req, ctx)
    expect(res.status).toBe(401)
  })

  it('returns 500 on unexpected error', async () => {
    vi.mocked(prisma.job.update).mockRejectedValue(new Error('DB error'))
    const [req, ctx] = makeRequest('job-1')
    const res = await POST(req, ctx)
    expect(res.status).toBe(500)
  })
})
