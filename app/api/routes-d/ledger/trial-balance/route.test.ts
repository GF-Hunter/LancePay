import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    journalEntry: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

function makeRequest(url = 'http://localhost/api/routes-d/ledger/trial-balance'): NextRequest {
  return new NextRequest(url, { headers: { authorization: 'Bearer token' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
})

describe('GET /api/routes-d/ledger/trial-balance', () => {
  it('returns balanced trial balance for matching entries', async () => {
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      { debitAccount: 'cash', creditAccount: 'revenue', amount: 100 },
      { debitAccount: 'cash', creditAccount: 'revenue', amount: 50 },
    ] as any)

    const res = await GET(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.balanced).toBe(true)
    expect(data.totalDebits).toBe(data.totalCredits)
    const cash = data.lines.find((l: any) => l.account === 'cash')
    expect(cash.debits).toBe(150)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(new NextRequest('http://localhost/api/routes-d/ledger/trial-balance'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns empty lines for user with no entries', async () => {
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([])
    const res = await GET(makeRequest())
    const data = await res.json()
    expect(data.lines).toHaveLength(0)
    expect(data.balanced).toBe(true)
  })
})
