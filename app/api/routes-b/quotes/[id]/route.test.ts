import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    quote: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUserId = 'user-123'
const mockPrivyId = 'privy-123'
const mockQuoteId = 'quote-123'
const params = { id: mockQuoteId }

function makeRequest() {
  return new NextRequest(`http://localhost:3000/api/routes-b/quotes/${mockQuoteId}`, {
    headers: { Authorization: 'Bearer valid-token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: mockPrivyId } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: mockUserId } as never)
})

describe('GET /api/routes-b/quotes/[id]', () => {
  it('returns the quote for the authenticated owner', async () => {
    const mockQuote = {
      id: mockQuoteId,
      clientEmail: 'client@example.com',
      clientName: 'Acme Corp',
      description: 'Website redesign',
      amount: 1500,
      currency: 'USD',
      status: 'pending',
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(mockQuote as never)

    const res = await GET(makeRequest(), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.quote.id).toBe(mockQuoteId)
    expect(data.quote.amount).toBe(1500)
  })

  it('returns 401 when no auth token provided', async () => {
    const request = new NextRequest(`http://localhost:3000/api/routes-b/quotes/${mockQuoteId}`)
    const res = await GET(request, { params })
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 401 when the token is invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user record cannot be found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the quote does not exist or belongs to another user', async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(null)
    const res = await GET(makeRequest(), { params })
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.error).toBe('Quote not found')
  })

  it('scopes the lookup to the authenticated user (ownership check)', async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue({
      id: mockQuoteId,
      amount: 100,
    } as never)
    await GET(makeRequest(), { params })
    expect(prisma.quote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: mockQuoteId, userId: mockUserId } }),
    )
  })

  it('returns 500 on database error', async () => {
    vi.mocked(prisma.quote.findFirst).mockRejectedValue(new Error('Database connection failed'))
    const res = await GET(makeRequest(), { params })
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toBe('Failed to fetch quote')
  })
})
