import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    loginNotificationSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/auth/notify-on-login', {
    method,
    headers: { authorization: 'Bearer token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
})

describe('GET /api/routes-d/auth/notify-on-login', () => {
  it('returns defaults when no settings row exists yet', async () => {
    vi.mocked(prisma.loginNotificationSettings.findUnique).mockResolvedValue(null)

    const res = await GET(makeRequest('GET'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.settings.notifyOnNewDevice).toBe(true)
    expect(data.settings.notifyEmail).toBeNull()
    expect(data.settings.updatedAt).toBeNull()
  })

  it('returns the persisted settings when a row exists', async () => {
    vi.mocked(prisma.loginNotificationSettings.findUnique).mockResolvedValue({
      notifyOnNewDevice: false,
      notifyEmail: 'alerts@example.com',
      updatedAt: new Date('2026-07-01'),
    } as any)

    const res = await GET(makeRequest('GET'))
    const data = await res.json()

    expect(data.settings.notifyOnNewDevice).toBe(false)
    expect(data.settings.notifyEmail).toBe('alerts@example.com')
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(new NextRequest('http://localhost/api/routes-d/auth/notify-on-login'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/routes-d/auth/notify-on-login', () => {
  it('updates notifyOnNewDevice', async () => {
    vi.mocked(prisma.loginNotificationSettings.upsert).mockResolvedValue({
      notifyOnNewDevice: false,
      notifyEmail: null,
      updatedAt: new Date(),
    } as any)

    const res = await PATCH(makeRequest('PATCH', { notifyOnNewDevice: false }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.settings.notifyOnNewDevice).toBe(false)
  })

  it('updates notifyEmail with a valid address', async () => {
    vi.mocked(prisma.loginNotificationSettings.upsert).mockResolvedValue({
      notifyOnNewDevice: true,
      notifyEmail: 'ops@example.com',
      updatedAt: new Date(),
    } as any)

    const res = await PATCH(makeRequest('PATCH', { notifyEmail: 'ops@example.com' }))
    expect(res.status).toBe(200)
  })

  it('clears notifyEmail when explicitly set to null', async () => {
    vi.mocked(prisma.loginNotificationSettings.upsert).mockResolvedValue({
      notifyOnNewDevice: true,
      notifyEmail: null,
      updatedAt: new Date(),
    } as any)

    const res = await PATCH(makeRequest('PATCH', { notifyEmail: null }))
    expect(res.status).toBe(200)
  })

  it('returns 400 for a non-boolean notifyOnNewDevice', async () => {
    const res = await PATCH(makeRequest('PATCH', { notifyOnNewDevice: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid notifyEmail', async () => {
    const res = await PATCH(makeRequest('PATCH', { notifyEmail: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when no fields are provided', async () => {
    const res = await PATCH(makeRequest('PATCH', {}))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await PATCH(new NextRequest('http://localhost/api/routes-d/auth/notify-on-login', { method: 'PATCH' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await PATCH(makeRequest('PATCH', { notifyOnNewDevice: false }))
    expect(res.status).toBe(404)
  })
})
