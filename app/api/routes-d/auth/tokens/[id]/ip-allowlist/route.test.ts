import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    apiToken: { findFirst: vi.fn() },
    tokenIpAllowlist: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockToken = { id: 'tok-1', userId: 'user-1' }
const params = { id: 'tok-1' }

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/auth/tokens/tok-1/ip-allowlist', {
    method,
    headers: { authorization: 'Bearer token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
  vi.mocked(prisma.apiToken.findFirst).mockResolvedValue(mockToken as any)
  vi.mocked(prisma.tokenIpAllowlist.findFirst).mockResolvedValue(null)
})

describe('GET /api/routes-d/auth/tokens/[id]/ip-allowlist', () => {
  it('returns allowlist entries', async () => {
    vi.mocked(prisma.tokenIpAllowlist.findMany).mockResolvedValue([
      { id: 'ip-1', cidr: '192.168.1.0/24', label: 'office', createdAt: new Date() },
    ] as any)

    const res = await GET(makeRequest('GET'), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].cidr).toBe('192.168.1.0/24')
  })

  it('returns 404 when token not found', async () => {
    vi.mocked(prisma.apiToken.findFirst).mockResolvedValue(null)
    const res = await GET(makeRequest('GET'), { params })
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(new NextRequest('http://localhost/api/routes-d/auth/tokens/tok-1/ip-allowlist'), { params })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/routes-d/auth/tokens/[id]/ip-allowlist', () => {
  it('adds a valid IPv4 CIDR', async () => {
    vi.mocked(prisma.tokenIpAllowlist.create).mockResolvedValue({ id: 'ip-2', cidr: '10.0.0.0/8', label: null, createdAt: new Date() } as any)

    const res = await POST(makeRequest('POST', { cidr: '10.0.0.0/8' }), { params })
    expect(res.status).toBe(201)
  })

  it('returns 400 for invalid CIDR', async () => {
    const res = await POST(makeRequest('POST', { cidr: 'not-an-ip' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 409 when CIDR already in allowlist', async () => {
    vi.mocked(prisma.tokenIpAllowlist.findFirst).mockResolvedValue({ id: 'ip-1' } as any)
    const res = await POST(makeRequest('POST', { cidr: '192.168.1.0/24' }), { params })
    expect(res.status).toBe(409)
  })

  it('returns 400 when cidr missing', async () => {
    const res = await POST(makeRequest('POST', { label: 'home' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 404 when token not found', async () => {
    vi.mocked(prisma.apiToken.findFirst).mockResolvedValue(null)
    const res = await POST(makeRequest('POST', { cidr: '1.2.3.4' }), { params })
    expect(res.status).toBe(404)
  })
})
