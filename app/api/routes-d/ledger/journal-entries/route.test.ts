import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    journalEntry: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  verifyAuthToken: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1', privyId: 'privy-1' }
const mockClaims = { userId: 'privy-1' }

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer valid-token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
})

describe('GET /api/routes-d/ledger/journal-entries', () => {
  it('returns entries for authenticated user', async () => {
    const entries = [{ id: 'je-1', amount: 100 }]
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue(entries as any)
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(1)

    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/ledger/journal-entries'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.entries).toEqual(entries)
    expect(data.total).toBe(1)
  })

  it('returns 401 when no token', async () => {
    const req = new NextRequest('http://localhost/api/routes-d/ledger/journal-entries')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when token invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null as any)
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/ledger/journal-entries'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(makeRequest('GET', 'http://localhost/api/routes-d/ledger/journal-entries'))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/routes-d/ledger/journal-entries', () => {
  const validBody = {
    debitAccount: 'cash',
    creditAccount: 'revenue',
    amount: 250,
    currency: 'USD',
    description: 'Test entry',
  }

  it('creates a journal entry', async () => {
    const created = { id: 'je-2', ...validBody }
    vi.mocked(prisma.journalEntry.create).mockResolvedValue(created as any)

    const res = await POST(makeRequest('POST', 'http://localhost/api/routes-d/ledger/journal-entries', validBody))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.entry.id).toBe('je-2')
  })

  it('returns 400 when amount is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/routes-d/ledger/journal-entries', { ...validBody, amount: undefined }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when debitAccount is empty', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/routes-d/ledger/journal-entries', { ...validBody, debitAccount: '  ' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-d/ledger/journal-entries', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
