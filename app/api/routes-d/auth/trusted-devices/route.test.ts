import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    trustedDevice: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/auth/trusted-devices', {
    method,
    headers: { authorization: 'Bearer token', 'user-agent': 'Mozilla/5.0' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
})

describe('GET /api/routes-d/auth/trusted-devices', () => {
  it('returns list of trusted devices', async () => {
    const devices = [{ id: 'dev-1', name: 'MacBook Pro', lastSeenAt: new Date() }]
    vi.mocked(prisma.trustedDevice.findMany).mockResolvedValue(devices as any)

    const res = await GET(makeRequest('GET'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.devices).toHaveLength(1)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(new NextRequest('http://localhost/api/routes-d/auth/trusted-devices'))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/routes-d/auth/trusted-devices', () => {
  it('creates a trusted device with a valid name', async () => {
    const device = { id: 'dev-2', name: 'iPhone 15', userAgent: 'Mozilla/5.0' }
    vi.mocked(prisma.trustedDevice.create).mockResolvedValue(device as any)

    const res = await POST(makeRequest('POST', { name: 'iPhone 15' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.device.name).toBe('iPhone 15')
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', {}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is empty string', async () => {
    const res = await POST(makeRequest('POST', { name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(new NextRequest('http://localhost/api/routes-d/auth/trusted-devices', { method: 'POST' }))
    expect(res.status).toBe(401)
  })
})
