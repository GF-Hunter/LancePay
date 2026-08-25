import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    attachment: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockAttachment = { id: 'att-1', thumbnailUrl: 'https://cdn.example.com/thumb.png', mimeType: 'image/png' }
const params = Promise.resolve({ id: 'att-1' })

function makeGet(withAuth = true) {
  return new NextRequest('http://localhost/api/routes-b/attachments/att-1/thumbnail', {
    method: 'GET',
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.attachment.findFirst).mockResolvedValue(mockAttachment as never)
})

describe('GET /api/routes-b/attachments/[id]/thumbnail', () => {
  it('returns the thumbnail url for an owned attachment', async () => {
    const res = await GET(makeGet(), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.thumbnailUrl).toBe('https://cdn.example.com/thumb.png')
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGet(false), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when attachment does not exist or is not owned by the user', async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(null)
    const res = await GET(makeGet(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the attachment has no thumbnail', async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue({ id: 'att-1', thumbnailUrl: null } as never)
    const res = await GET(makeGet(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 when id is blank', async () => {
    const res = await GET(makeGet(), { params: Promise.resolve({ id: ' ' }) })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the delegate throws', async () => {
    vi.mocked(prisma.attachment.findFirst).mockRejectedValue(new Error('db error'))
    const res = await GET(makeGet(), { params })
    expect(res.status).toBe(500)
  })
})
