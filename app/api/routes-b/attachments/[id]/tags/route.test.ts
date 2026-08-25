import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    attachment: { findFirst: vi.fn() },
    attachmentTag: { findMany: vi.fn(), createMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockAttachment = { id: 'att-1' }
const params = Promise.resolve({ id: 'att-1' })

function makeGet(withAuth = true) {
  return new NextRequest('http://localhost/api/routes-b/attachments/att-1/tags', {
    method: 'GET',
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

function makePost(body: unknown, withAuth = true) {
  return new NextRequest('http://localhost/api/routes-b/attachments/att-1/tags', {
    method: 'POST',
    headers: {
      ...(withAuth ? { authorization: 'Bearer token' } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.attachment.findFirst).mockResolvedValue(mockAttachment as never)
  vi.mocked(prisma.attachmentTag.findMany).mockResolvedValue([
    { id: 'tag-1', name: 'invoice', createdAt: new Date() },
  ] as never)
  vi.mocked(prisma.attachmentTag.createMany).mockResolvedValue({ count: 2 })
})

describe('GET /api/routes-b/attachments/[id]/tags', () => {
  it('lists tags for an owned attachment', async () => {
    const res = await GET(makeGet(), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.tags).toHaveLength(1)
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
})

describe('POST /api/routes-b/attachments/[id]/tags', () => {
  it('adds tags from an explicit array', async () => {
    const res = await POST(makePost({ tags: ['invoice', 'q1'] }), { params })
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.tagsAdded).toBe(2)
    expect(data.tags).toEqual(['invoice', 'q1'])
  })

  it('adds a single tag', async () => {
    const res = await POST(makePost({ tag: 'receipt' }), { params })
    expect(res.status).toBe(201)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(makePost({ tags: ['a'] }, false), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when attachment does not exist or is not owned by the user', async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(null)
    const res = await POST(makePost({ tags: ['a'] }), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 when no tag names are provided', async () => {
    const res = await POST(makePost({ tags: [] }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when too many tags are provided', async () => {
    const res = await POST(makePost({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/attachments/att-1/tags', {
      method: 'POST',
      body: 'not-json',
      headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(400)
  })
})
