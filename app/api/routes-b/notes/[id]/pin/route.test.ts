import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    note: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockNote = { id: 'note-1', isPinned: false }
const params = { id: 'note-1' }

function makeRequest(body?: unknown) {
  return new NextRequest('http://localhost/api/routes-b/notes/note-1/pin', {
    method: 'PATCH',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.note.findFirst).mockResolvedValue(mockNote as never)
  vi.mocked(prisma.note.update).mockResolvedValue({ id: 'note-1', isPinned: true, updatedAt: new Date() } as never)
})

describe('PATCH /api/routes-b/notes/[id]/pin', () => {
  it('pins a note when pinned is not specified (toggles)', async () => {
    const res = await PATCH(makeRequest(), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toHaveProperty('id')
    expect(data).toHaveProperty('isPinned')
  })

  it('explicitly pins a note when pinned: true is sent', async () => {
    const res = await PATCH(makeRequest({ pinned: true }), { params })
    expect(res.status).toBe(200)
  })

  it('explicitly unpins a note when pinned: false is sent', async () => {
    vi.mocked(prisma.note.update).mockResolvedValue({ id: 'note-1', isPinned: false, updatedAt: new Date() } as never)
    const res = await PATCH(makeRequest({ pinned: false }), { params })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.isPinned).toBe(false)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/notes/note-1/pin', { method: 'PATCH' })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when note does not exist or belongs to another user', async () => {
    vi.mocked(prisma.note.findFirst).mockResolvedValue(null)
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(404)
  })
})
