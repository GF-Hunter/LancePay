import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    auditEvent: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockEventFindFirst = prisma.auditEvent.findFirst as unknown as ReturnType<typeof vi.fn>

const params = Promise.resolve({ id: 'evt-1' })

function makeReq(token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest('http://localhost/api/routes-b/audit-log/evt-1', { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockEventFindFirst.mockResolvedValue({
    id: 'evt-1',
    invoiceId: 'inv-1',
    eventType: 'invoice.paid',
    actorId: 'user-1',
    metadata: null,
    createdAt: new Date(),
  })
})

describe('GET /api/routes-b/audit-log/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeReq(null), { params })
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user is not found', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the entry does not exist or belongs to another user', async () => {
    mockEventFindFirst.mockResolvedValue(null)
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Audit log entry not found')
  })

  it('scopes the lookup to the authenticated user (ownership check)', async () => {
    await GET(makeReq(), { params })
    expect(mockEventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1', invoice: { userId: 'user-1' } },
      }),
    )
  })

  it('returns 200 with the event on the happy path', async () => {
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.event.id).toBe('evt-1')
  })

  it('returns 400 when id is blank', async () => {
    const res = await GET(makeReq(), { params: Promise.resolve({ id: '   ' }) })
    expect(res.status).toBe(400)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockEventFindFirst.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch audit log entry')
  })
})
