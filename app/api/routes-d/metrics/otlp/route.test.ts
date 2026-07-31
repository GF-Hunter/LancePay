import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    }
  },
}))

vi.mock('@/lib/auth', () => ({
  verifyAuthToken: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1', privyId: 'privy-1' }
const mockClaims = { userId: 'privy-1' }
const mockProject = { id: 'proj-1', userId: 'user-1' }

function makeRequest(method: string, url: string): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer valid-token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
  vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
})

describe('GET /api/routes-d/metrics/otlp', () => {
  it('returns OTLP metrics for authorized project owner', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/metrics/otlp?projectId=proj-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.resourceMetrics).toBeDefined()
    expect(data.resourceMetrics[0].resource.attributes[0].value.stringValue).toBe('proj-1')
  })

  it('returns 400 when projectId is missing', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/metrics/otlp'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when project is not found', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/metrics/otlp?projectId=proj-nonexistent'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user does not own the project', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'proj-2', userId: 'user-other' } as any)
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/metrics/otlp?projectId=proj-2'))
    expect(res.status).toBe(403)
  })

  it('returns 401 when no token', async () => {
    const req = new NextRequest('http://localhost/api/routes-d/metrics/otlp?projectId=proj-1')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when token invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null as any)
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/metrics/otlp?projectId=proj-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/metrics/otlp?projectId=proj-1'))
    expect(res.status).toBe(404)
  })

  it('returns 500 on internal error', async () => {
    vi.mocked(prisma.project.findUnique).mockRejectedValue(new Error('DB Error'))
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/metrics/otlp?projectId=proj-1'))
    expect(res.status).toBe(500)
  })
})
