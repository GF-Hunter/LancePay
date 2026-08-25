import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    paymentPlan: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockPlanFindUnique = prisma.paymentPlan.findUnique as unknown as ReturnType<typeof vi.fn>

function makeGet(id: string, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`http://localhost/api/routes-b/payment-plans/${id}`, { headers })
}

function callGet(id: string, token: string | null = 'Bearer valid-token') {
  return GET(makeGet(id, token), { params: Promise.resolve({ id }) })
}

const mockPlan = {
  id: 'plan-1',
  userId: 'user-1',
  invoiceId: 'inv-1',
  totalAmount: { toString: () => '600' },
  currency: 'USD',
  installmentCount: 3,
  frequency: 'monthly',
  status: 'active',
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
  installments: [
    { id: 'inst-1', sequence: 1, amount: { toString: () => '200' }, dueDate: new Date('2026-09-01'), status: 'pending', paidAt: null },
    { id: 'inst-2', sequence: 2, amount: { toString: () => '200' }, dueDate: new Date('2026-10-01'), status: 'pending', paidAt: null },
    { id: 'inst-3', sequence: 3, amount: { toString: () => '200' }, dueDate: new Date('2026-11-01'), status: 'pending', paidAt: null },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockPlanFindUnique.mockResolvedValue(mockPlan)
})

describe('GET /api/routes-b/payment-plans/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callGet('plan-1', null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the payment plan does not exist', async () => {
    mockPlanFindUnique.mockResolvedValue(null)
    const res = await callGet('missing-plan')
    expect(res.status).toBe(404)
  })

  it('returns 403 when the plan belongs to a different user', async () => {
    mockPlanFindUnique.mockResolvedValue({ ...mockPlan, userId: 'someone-else' })
    const res = await callGet('plan-1')
    expect(res.status).toBe(403)
  })

  it('returns 200 with the plan and its installment schedule on the happy path', async () => {
    const res = await callGet('plan-1')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.paymentPlan.id).toBe('plan-1')
    expect(json.paymentPlan.totalAmount).toBe(600)
    expect(json.paymentPlan.installments).toHaveLength(3)
    expect(json.paymentPlan.installments[0].amount).toBe(200)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockPlanFindUnique.mockRejectedValue(new Error('db unavailable'))
    const res = await callGet('plan-1')
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch payment plan')
  })
})
