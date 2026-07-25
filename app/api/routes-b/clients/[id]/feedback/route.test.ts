import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    client: { findFirst: vi.fn() },
    clientFeedback: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClient = { id: 'client-1', userId: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const params = { id: 'client-1' }

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
  vi.mocked(prisma.client.findFirst).mockResolvedValue(mockClient as any)
})

describe('GET /api/routes-b/clients/[id]/feedback', () => {
  it('returns feedback list', async () => {
    vi.mocked(prisma.clientFeedback.findMany).mockResolvedValue([{ id: 'fb-1', rating: 5 }] as any)
    vi.mocked(prisma.clientFeedback.count).mockResolvedValue(1)

    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-b/clients/client-1/feedback'), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.feedback).toHaveLength(1)
    expect(data.total).toBe(1)
  })

  it('returns 404 when client not found', async () => {
    vi.mocked(prisma.client.findFirst).mockResolvedValue(null)
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-b/clients/client-1/feedback'), { params })
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/clients/client-1/feedback')
    const res = await GET(req, { params })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/routes-b/clients/[id]/feedback', () => {
  it('creates feedback with valid rating', async () => {
    vi.mocked(prisma.clientFeedback.create).mockResolvedValue({ id: 'fb-2', rating: 4 } as any)
    const res = await POST(makeRequest('POST', 'http://localhost/api/routes-b/clients/client-1/feedback', { rating: 4, comment: 'Good work' }), { params })
    expect(res.status).toBe(201)
  })

  it('returns 400 when rating out of range', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/routes-b/clients/client-1/feedback', { rating: 6 }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when rating missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/routes-b/clients/client-1/feedback', { comment: 'No rating' }), { params })
    expect(res.status).toBe(400)
  })
})
