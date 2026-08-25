import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    inAppAnnouncement: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockAnnouncement = {
  id: 'ann-1',
  title: 'New feature available',
  body: 'Check out the new dashboard!',
  authorId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeGet(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/routes-b/in-app-announcements')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url, { headers: { authorization: 'Bearer token' } })
}

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/in-app-announcements', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.inAppAnnouncement.findMany).mockResolvedValue([mockAnnouncement] as never)
  vi.mocked(prisma.inAppAnnouncement.count).mockResolvedValue(1)
  vi.mocked(prisma.inAppAnnouncement.create).mockResolvedValue(mockAnnouncement as never)
})

describe('GET /api/routes-b/in-app-announcements', () => {
  it('returns list of announcements', async () => {
    const res = await GET(makeGet())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data.announcements)).toBe(true)
    expect(typeof data.total).toBe('number')
  })

  it('supports a limit query param, capped at 100', async () => {
    await GET(makeGet({ limit: '500' }))
    const call = vi.mocked(prisma.inAppAnnouncement.findMany).mock.calls[0][0] as { take: number }
    expect(call.take).toBe(100)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/routes-b/in-app-announcements')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/routes-b/in-app-announcements', () => {
  it('creates an announcement', async () => {
    const res = await POST(makePost({ title: 'New feature available', body: 'Check out the new dashboard!' }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.title).toBe('New feature available')
  })

  it('returns 400 when title is missing', async () => {
    const res = await POST(makePost({ body: 'No title here' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when body is missing', async () => {
    const res = await POST(makePost({ title: 'Title only' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when title exceeds max length', async () => {
    const res = await POST(makePost({ title: 'a'.repeat(201), body: 'valid body' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when body exceeds max length', async () => {
    const res = await POST(makePost({ title: 'valid title', body: 'a'.repeat(5001) }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/in-app-announcements', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/routes-b/in-app-announcements', {
      method: 'POST',
      body: JSON.stringify({ title: 'x', body: 'y' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
