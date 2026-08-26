import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    creditNote: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockCreditNoteFindUnique = prisma.creditNote.findUnique as unknown as ReturnType<typeof vi.fn>

function makeGet(id: string, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`http://localhost/api/routes-b/credit-notes/${id}`, { headers })
}

function callGet(id: string, token: string | null = 'Bearer valid-token') {
  return GET(makeGet(id, token), { params: Promise.resolve({ id }) })
}

const mockCreditNote = {
  id: 'cn-1',
  userId: 'user-1',
  invoiceId: 'inv-1',
  creditNumber: 'CN-ABC123-XYZ789',
  amount: { toString: () => '50' },
  currency: 'USD',
  reason: 'Duplicate charge',
  status: 'issued',
  createdAt: new Date('2026-08-01'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockCreditNoteFindUnique.mockResolvedValue(mockCreditNote)
})

describe('GET /api/routes-b/credit-notes/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callGet('cn-1', null)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await callGet('cn-1')
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user record is missing', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await callGet('cn-1')
    expect(res.status).toBe(404)
  })

  it('returns 404 when the credit note does not exist', async () => {
    mockCreditNoteFindUnique.mockResolvedValue(null)
    const res = await callGet('missing')
    expect(res.status).toBe(404)
  })

  it("returns 403 when the credit note belongs to another user", async () => {
    mockCreditNoteFindUnique.mockResolvedValue({ ...mockCreditNote, userId: 'someone-else' })
    const res = await callGet('cn-1')
    expect(res.status).toBe(403)
  })

  it('returns 200 with the credit note on the happy path', async () => {
    const res = await callGet('cn-1')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.creditNote.id).toBe('cn-1')
    expect(json.creditNote.amount).toBe(50)
    expect(json.creditNote.creditNumber).toBe('CN-ABC123-XYZ789')
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockCreditNoteFindUnique.mockRejectedValue(new Error('db unavailable'))
    const res = await callGet('cn-1')
    expect(res.status).toBe(500)
  })
})
