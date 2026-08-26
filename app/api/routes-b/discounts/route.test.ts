import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    discount: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockFindMany = prisma.discount.findMany as unknown as ReturnType<typeof vi.fn>
const mockCount = prisma.discount.count as unknown as ReturnType<typeof vi.fn>
const mockCreate = prisma.discount.create as unknown as ReturnType<typeof vi.fn>
const mockDiscountFindUnique = prisma.discount.findUnique as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/discounts'

function makeGet(query = '', token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

function makePost(body: unknown, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const mockDiscount = {
  id: 'disc-1',
  code: 'SAVE10',
  type: 'percent',
  value: { toString: () => '10' },
  active: true,
  maxRedemptions: null,
  redemptions: 0,
  expiresAt: null,
  createdAt: new Date('2026-08-01'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockFindMany.mockResolvedValue([mockDiscount])
  mockCount.mockResolvedValue(1)
  mockDiscountFindUnique.mockResolvedValue(null)
  mockCreate.mockResolvedValue({
    id: 'disc-new',
    code: 'SAVE20',
    type: 'percent',
    value: { toString: () => '20' },
    active: true,
    maxRedemptions: 100,
    redemptions: 0,
    expiresAt: null,
    createdAt: new Date('2026-08-25'),
  })
})

describe('GET /api/routes-b/discounts', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGet('', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns 200 with paginated discounts on the happy path', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.discounts).toHaveLength(1)
    expect(json.discounts[0].value).toBe(10)
    expect(json.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 })
  })

  it('scopes the query to the authenticated user (ownership check)', async () => {
    await GET(makeGet())
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('filters by active when provided', async () => {
    await GET(makeGet('?active=false'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ active: false }) }),
    )
  })

  it('rejects an invalid active value with 400', async () => {
    const res = await GET(makeGet('?active=bogus'))
    expect(res.status).toBe(400)
  })

  it('clamps limit to the maximum allowed', async () => {
    const res = await GET(makeGet('?limit=9999'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pagination.limit).toBe(100)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockFindMany.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeGet())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch discounts')
  })
})

describe('POST /api/routes-b/discounts', () => {
  const validBody = { code: 'SAVE20', type: 'percent', value: 20 }

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(makePost(validBody, null))
    expect(res.status).toBe(401)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await POST(makePost('not-json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when code is missing', async () => {
    const res = await POST(makePost({ ...validBody, code: undefined }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when code has invalid characters', async () => {
    const res = await POST(makePost({ ...validBody, code: 'not a code!' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid type', async () => {
    const res = await POST(makePost({ ...validBody, type: 'bogus' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when value is not a positive number', async () => {
    const res = await POST(makePost({ ...validBody, value: -5 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when a percent value exceeds 100', async () => {
    const res = await POST(makePost({ ...validBody, value: 150 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when maxRedemptions is not a positive integer', async () => {
    const res = await POST(makePost({ ...validBody, maxRedemptions: -1 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when expiresAt is not a valid date', async () => {
    const res = await POST(makePost({ ...validBody, expiresAt: 'not-a-date' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when the code already exists for this user', async () => {
    mockDiscountFindUnique.mockResolvedValue({ id: 'existing' })
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(409)
  })

  it('creates a discount and returns 201 on the happy path', async () => {
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.discount.code).toBe('SAVE20')
    expect(json.discount.value).toBe(20)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', code: 'SAVE20' }),
      }),
    )
  })

  it('normalizes the code to uppercase', async () => {
    await POST(makePost({ ...validBody, code: 'save20' }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'SAVE20' }) }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockCreate.mockRejectedValue(new Error('db unavailable'))
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(500)
  })
})
