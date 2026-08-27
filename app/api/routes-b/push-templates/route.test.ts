import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    pushTemplate: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockTemplate = {
  id: 'push-1',
  name: 'Invoice Paid',
  title: 'Invoice Payment Received',
  body: 'Your invoice #{{id}} was paid.',
  category: 'transaction',
  userId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeGet(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/routes-b/push-templates')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url, { headers: { authorization: 'Bearer token' } })
}

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/push-templates', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  const delegate = (prisma as unknown as { pushTemplate: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }).pushTemplate
  if (delegate) {
    vi.mocked(delegate.findMany).mockResolvedValue([mockTemplate] as never)
    vi.mocked(delegate.create).mockResolvedValue(mockTemplate as never)
  }
})

describe('GET /api/routes-b/push-templates', () => {
  it('returns push notification templates list', async () => {
    const res = await GET(makeGet())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data.templates)).toBe(true)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/push-templates')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/routes-b/push-templates', () => {
  it('creates push template successfully', async () => {
    const res = await POST(
      makePost({ name: 'Invoice Paid', title: 'Payment Received', body: 'Invoice paid' })
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Invoice Paid')
  })

  it('returns 400 when missing required fields', async () => {
    const res = await POST(makePost({ name: 'Only Name' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/push-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'a', title: 'b', body: 'c' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
