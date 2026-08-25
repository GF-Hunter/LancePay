import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({
  verifyAuthToken: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

const mockedVerify = vi.mocked(verifyAuthToken)
const mockedUserFind = vi.mocked(prisma.user.findUnique)
const mockedInvoiceFind = vi.mocked(prisma.invoice.findUnique)
const mockedInvoiceUpdate = vi.mocked(prisma.invoice.update)

const fakeUser = { id: 'user-1', privyId: 'privy-1' }
const fakePendingInvoice = { id: 'inv-1', userId: 'user-1', status: 'pending' }

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-b/invoices/inv-1/amount', {
    method: 'PATCH',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'inv-1' })

describe('PATCH /api/routes-b/invoices/[id]/amount', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    mockedUserFind.mockResolvedValue(fakeUser as never)
    mockedInvoiceFind.mockResolvedValue(fakePendingInvoice as never)
    mockedInvoiceUpdate.mockResolvedValue({
      id: 'inv-1',
      amount: 250,
      currency: 'USDC',
      status: 'pending',
      updatedAt: new Date(),
    } as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await PATCH(makeRequest({ amount: 100 }), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    mockedInvoiceFind.mockResolvedValue(null as never)
    const res = await PATCH(makeRequest({ amount: 100 }), { params })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user does not own invoice', async () => {
    mockedInvoiceFind.mockResolvedValue({ ...fakePendingInvoice, userId: 'other-user' } as never)
    const res = await PATCH(makeRequest({ amount: 100 }), { params })
    expect(res.status).toBe(403)
  })

  it('returns 422 when invoice is not pending', async () => {
    mockedInvoiceFind.mockResolvedValue({ ...fakePendingInvoice, status: 'paid' } as never)
    const res = await PATCH(makeRequest({ amount: 100 }), { params })
    expect(res.status).toBe(422)
  })

  it('returns 400 when amount is missing', async () => {
    const res = await PATCH(makeRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is zero', async () => {
    const res = await PATCH(makeRequest({ amount: 0 }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is negative', async () => {
    const res = await PATCH(makeRequest({ amount: -50 }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is a string', async () => {
    const res = await PATCH(makeRequest({ amount: 'a lot' }), { params })
    expect(res.status).toBe(400)
  })

  it('updates amount and returns updated invoice', async () => {
    const res = await PATCH(makeRequest({ amount: 250 }), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('inv-1')
    expect(body.amount).toBe(250)
    expect(mockedInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amount: 250 } }),
    )
  })
})
