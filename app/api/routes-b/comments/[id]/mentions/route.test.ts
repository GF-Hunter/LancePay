import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    comment: { findFirst: vi.fn() },
    commentMention: { createMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockComment = { id: 'comment-1' }
const params = { id: 'comment-1' }

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/comments/comment-1/mentions', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.comment.findFirst).mockResolvedValue(mockComment as never)
  vi.mocked(prisma.commentMention.createMany).mockResolvedValue({ count: 2 })
})

describe('POST /api/routes-b/comments/[id]/mentions', () => {
  it('records mentions from an explicit array', async () => {
    const res = await POST(makePost({ mentions: ['alice', 'bob'] }), { params })
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.commentId).toBe('comment-1')
    expect(data.mentionsRecorded).toBe(2)
    expect(data.mentionedUsernames).toEqual(['alice', 'bob'])
  })

  it('parses @mentions from a text field', async () => {
    vi.mocked(prisma.commentMention.createMany).mockResolvedValue({ count: 1 })
    const res = await POST(makePost({ text: 'Hey @charlie, check this!' }), { params })
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.mentionedUsernames).toContain('charlie')
  })

  it('returns 400 when no mentions found', async () => {
    const res = await POST(makePost({ text: 'No mentions here' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/comments/comment-1/mentions', {
      method: 'POST',
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when comment does not exist', async () => {
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(null)
    const res = await POST(makePost({ mentions: ['dave'] }), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/comments/comment-1/mentions', {
      method: 'POST',
      body: 'not-json',
      headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(400)
  })
})
