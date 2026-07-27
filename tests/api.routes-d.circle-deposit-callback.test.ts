import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/routes-d/integrations/circle/deposit-callback/route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    virtualAccount: { findFirst: vi.fn() },
    transaction: { findFirst: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { prisma } from '@/lib/db'

const SECRET = 'test-circle-secret'

function makeRequest(body: unknown, signature = SECRET): NextRequest {
  return new NextRequest(
    'http://localhost/api/routes-d/integrations/circle/deposit-callback',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-circle-signature': signature,
      },
      body: JSON.stringify(body),
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CIRCLE_WEBHOOK_SECRET = SECRET
})

afterEach(() => {
  delete process.env.CIRCLE_WEBHOOK_SECRET
})

describe('POST /api/routes-d/integrations/circle/deposit-callback', () => {
  it('records a confirmed deposit', async () => {
    const va = { id: 'va-1', userId: 'user-1' }
    vi.mocked(prisma.virtualAccount.findFirst).mockResolvedValue(va as any)
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.transaction.create).mockResolvedValue({ id: 'tx-1' } as any)

    const res = await POST(makeRequest({
      type: 'deposit.confirmed',
      data: { id: 'circ-1', amount: '100.00', currency: 'USDC', accountId: 'acc-1', txHash: '0xabc' },
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.handled).toBe(true)
    expect(data.transactionId).toBe('tx-1')
  })

  it('skips duplicate deposits (idempotent)', async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({ id: 'existing' } as any)

    const res = await POST(makeRequest({
      type: 'deposit.confirmed',
      data: { id: 'circ-1', amount: '100.00', currency: 'USDC', accountId: 'acc-1' },
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.duplicate).toBe(true)
    expect(data.handled).toBe(false)
  })

  it('ignores non-deposit events', async () => {
    const res = await POST(makeRequest({
      type: 'transfer.created',
      data: { id: 't-1' },
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.handled).toBe(false)
  })

  it('returns 401 with invalid signature', async () => {
    const res = await POST(makeRequest({
      type: 'deposit.confirmed',
      data: { id: 'circ-1', amount: '100', currency: 'USDC' },
    }, 'wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when signature header is missing', async () => {
    const req = new NextRequest(
      'http://localhost/api/routes-d/integrations/circle/deposit-callback',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'deposit.confirmed', data: {} }),
      },
    )
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when event type is missing', async () => {
    const res = await POST(makeRequest({ data: { id: 'circ-1' } }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when virtual account not found', async () => {
    vi.mocked(prisma.virtualAccount.findFirst).mockResolvedValue(null)

    const res = await POST(makeRequest({
      type: 'deposit.confirmed',
      data: { id: 'circ-1', amount: '100', currency: 'USDC', accountId: 'unknown' },
    }))
    expect(res.status).toBe(404)
  })
})
