import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockAdmin = { id: 'user-1', role: 'admin', email: 'admin@test.com' }
const mockUser = { id: 'user-2', role: 'user', email: 'user@test.com' }
const mockClaims = { userId: 'privy-1' }

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/system/log-level', {
    method: 'PATCH',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockAdmin as any)
})

describe('PATCH /api/routes-d/system/log-level', () => {
  it('changes log level successfully', async () => {
    const res = await PATCH(makeRequest({ level: 'debug' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.currentLevel).toBe('debug')
    expect(data.changedBy).toBe('admin@test.com')
    expect(data.changedAt).toBeDefined()
  })

  it('tracks previous level', async () => {
    await PATCH(makeRequest({ level: 'warn' }))
    const res = await PATCH(makeRequest({ level: 'error' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.previousLevel).toBe('warn')
    expect(data.currentLevel).toBe('error')
  })

  it('accepts all valid log levels', async () => {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
    for (const level of levels) {
      const res = await PATCH(makeRequest({ level }))
      expect(res.status).toBe(200)
    }
  })

  it('returns 400 when level is missing', async () => {
    const res = await PATCH(makeRequest({}))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.validLevels).toBeDefined()
  })

  it('returns 400 for invalid log level', async () => {
    const res = await PATCH(makeRequest({ level: 'verbose' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when no token', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/routes-d/system/log-level', { method: 'PATCH' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
    const res = await PATCH(makeRequest({ level: 'debug' }))
    expect(res.status).toBe(403)
  })

  it('returns 500 on unexpected error', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB error'))
    const res = await PATCH(makeRequest({ level: 'debug' }))
    expect(res.status).toBe(500)
  })
})
