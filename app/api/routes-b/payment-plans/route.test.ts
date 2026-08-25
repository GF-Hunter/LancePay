import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    paymentPlan: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>
const mockFindMany = prisma.paymentPlan.findMany as unknown as ReturnType<typeof vi.fn>
const mockCount = prisma.paymentPlan.count as unknown as ReturnType<typeof vi.fn>
const mockCreate = prisma.paymentPlan.create as unknown as ReturnType<typeof vi.fn>
const mockPlanFindUnique = prisma.paymentPlan.findUnique as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/payment-plans'

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

const mockPlan = {
  id: 'plan-1',
  invoiceId: 'inv-1',
  totalAmount: { toString: () => '600' },
  currency: 'USD',
  installmentCount: 3,
  frequency: 'monthly',
  status: 'active',
  createdAt: new Date('2026-08-01'),
  _count: { installments: 3 },
}

const mockInvoice = { id: 'inv-1', amount: { toString: () => '600' }, currency: 'USD' }

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockFindMany.mockResolvedValue([mockPlan])
  mockCount.mockResolvedValue(1)
  mockInvoiceFindFirst.mockResolvedValue(mockInvoice)
  mockPlanFindUnique.mockResolvedValue(null)
  mockCreate.mockResolvedValue({
    id: 'plan-new',
    invoiceId: 'inv-1',
    totalAmount: { toString: () => '600' },
    currency: 'USD',
    installmentCount: 3,
    frequency: 'monthly',
    status: 'active',
    createdAt: new Date('2026-08-25'),
    installments: [
      { id: 'inst-1', sequence: 1, amount: { toString: () => '200' }, dueDate: new Date('2026-09-25'), status: 'pending' },
      { id: 'inst-2', sequence: 2, amount: { toString: () => '200' }, dueDate: new Date('2026-10-25'), status: 'pending' },
      { id: 'inst-3', sequence: 3, amount: { toString: () => '200' }, dueDate: new Date('2026-11-25'), status: 'pending' },
    ],
  })
})

describe('GET /api/routes-b/payment-plans', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGet('', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns 200 with paginated payment plans on the happy path', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.paymentPlans).toHaveLength(1)
    expect(json.paymentPlans[0].totalAmount).toBe(600)
    expect(json.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 })
  })

  it('scopes the query to the authenticated user (ownership check)', async () => {
    await GET(makeGet())
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('filters by status when provided', async () => {
    await GET(makeGet('?status=completed'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'completed' }) }),
    )
  })

  it('rejects an invalid status with 400', async () => {
    const res = await GET(makeGet('?status=bogus'))
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
    expect(json.error).toBe('Failed to fetch payment plans')
  })
})

describe('POST /api/routes-b/payment-plans', () => {
  const validBody = { invoiceId: 'inv-1', installmentCount: 3, frequency: 'monthly' }

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

  it('returns 400 when invoiceId is missing', async () => {
    const res = await POST(makePost({ ...validBody, invoiceId: undefined }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when installmentCount is below the minimum', async () => {
    const res = await POST(makePost({ ...validBody, installmentCount: 1 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when installmentCount exceeds the maximum', async () => {
    const res = await POST(makePost({ ...validBody, installmentCount: 61 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid frequency value', async () => {
    const res = await POST(makePost({ ...validBody, frequency: 'daily' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid startDate', async () => {
    const res = await POST(makePost({ ...validBody, startDate: 'not-a-date' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(404)
  })

  it('returns 409 when a payment plan already exists for the invoice', async () => {
    mockPlanFindUnique.mockResolvedValue({ id: 'existing-plan' })
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(409)
  })

  it('creates a payment plan with an even installment split and returns 201', async () => {
    const res = await POST(makePost(validBody))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.paymentPlan.id).toBe('plan-new')
    expect(json.paymentPlan.installments).toHaveLength(3)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          invoiceId: 'inv-1',
          totalAmount: 600,
          installmentCount: 3,
        }),
      }),
    )
  })

  it('absorbs rounding remainder into the final installment', async () => {
    mockInvoiceFindFirst.mockResolvedValue({ id: 'inv-1', amount: { toString: () => '100' }, currency: 'USD' })
    const res = await POST(makePost({ invoiceId: 'inv-1', installmentCount: 3, frequency: 'monthly' }))
    expect(res.status).toBe(201)

    const createCall = mockCreate.mock.calls[0][0]
    const installments = createCall.data.installments.create as Array<{ amount: number }>
    const sum = installments.reduce((acc, i) => acc + i.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(100)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockCreate.mockRejectedValue(new Error('db unavailable'))
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to create payment plan')
  })
})
