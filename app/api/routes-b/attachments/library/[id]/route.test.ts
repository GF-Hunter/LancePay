import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    attachmentLibraryItem: { findFirst: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockAttachment = { id: 'lib-1', userId: 'user-1' }
const params = Promise.resolve({ id: 'lib-1' })

function makeDelete(withAuth = true) {
  return new NextRequest('http://localhost/api/routes-b/attachments/library/lib-1', {
    method: 'DELETE',
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.attachmentLibraryItem.findFirst).mockResolvedValue(mockAttachment as never)
  vi.mocked(prisma.attachmentLibraryItem.delete).mockResolvedValue({} as never)
})

describe('DELETE /api/routes-b/attachments/library/[id]', () => {
  it('removes a library attachment successfully', async () => {
    const res = await DELETE(makeDelete(), { params })
    expect(res.status).toBe(204)
    expect(prisma.attachmentLibraryItem.delete).toHaveBeenCalledWith({ where: { id: 'lib-1' } })
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(makeDelete(false), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when attachment does not exist or is not owned by the user', async () => {
    vi.mocked(prisma.attachmentLibraryItem.findFirst).mockResolvedValue(null)
    const res = await DELETE(makeDelete(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 when id is blank', async () => {
    const res = await DELETE(makeDelete(), { params: Promise.resolve({ id: '  ' }) })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the delegate throws', async () => {
    vi.mocked(prisma.attachmentLibraryItem.delete).mockRejectedValue(new Error('db error'))
    const res = await DELETE(makeDelete(), { params })
    expect(res.status).toBe(500)
  })
})
