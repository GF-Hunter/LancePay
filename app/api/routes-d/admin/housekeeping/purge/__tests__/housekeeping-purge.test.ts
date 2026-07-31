import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userSession: { deleteMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { POST } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
const sessionDelegate = prisma.userSession as unknown as { deleteMany: ReturnType<typeof vi.fn> }
const notificationDelegate = prisma.notification as unknown as { deleteMany: ReturnType<typeof vi.fn> }
const BASE_URL = 'http://localhost/api/routes-d/admin/housekeeping/purge'

function makePost(body: unknown = {}, authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: authHeader
      ? { authorization: authHeader, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/routes-d/admin/housekeeping/purge', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    sessionDelegate.deleteMany.mockResolvedValue({ count: 3 })
    notificationDelegate.deleteMany.mockResolvedValue({ count: 5 })
  })

  it('returns 401 when no auth header', async () => {
    const res = await POST(makePost({}, null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await POST(makePost())
    expect(res.status).toBe(401)
  })

  it('returns 403 when actor is not admin', async () => {
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1', role: 'freelancer' })
    const res = await POST(makePost())
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid target', async () => {
    const res = await POST(makePost({ target: 'bogus' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid olderThanDays', async () => {
    const res = await POST(makePost({ olderThanDays: -5 }))
    expect(res.status).toBe(400)
  })

  it('purges both sessions and notifications by default', async () => {
    const res = await POST(makePost())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.purge.target).toBe('all')
    expect(body.purge.purgedSessions).toBe(3)
    expect(body.purge.purgedNotifications).toBe(5)
  })

  it('purges only sessions when target is sessions', async () => {
    const res = await POST(makePost({ target: 'sessions' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.purge.purgedSessions).toBe(3)
    expect(body.purge.purgedNotifications).toBe(0)
    expect(notificationDelegate.deleteMany).not.toHaveBeenCalled()
  })

  it('purges only notifications when target is notifications', async () => {
    const res = await POST(makePost({ target: 'notifications' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.purge.purgedNotifications).toBe(5)
    expect(body.purge.purgedSessions).toBe(0)
    expect(sessionDelegate.deleteMany).not.toHaveBeenCalled()
  })

  it('uses default olderThanDays of 90 when not provided', async () => {
    const res = await POST(makePost())
    const body = await res.json()
    expect(body.purge.olderThanDays).toBe(90)
  })
})
