import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindFirst = vi.fn()
const invoiceUpdate = vi.fn()
const invoiceUpdateMany = vi.fn()
const transactionCreate = vi.fn()
const paymentReminderFindMany = vi.fn()
const logAuditEvent = vi.fn()
const extractRequestMetadata = vi.fn(() => ({}))

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/audit', () => ({ logAuditEvent, extractRequestMetadata }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: {
      findFirst: invoiceFindFirst,
      update: invoiceUpdate,
      updateMany: invoiceUpdateMany,
    },
    paymentReminder: { findMany: paymentReminderFindMany },
    transaction: { create: transactionCreate },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      invoice: { updateMany: invoiceUpdateMany },
      transaction: { create: transactionCreate },
      auditEvent: { create: vi.fn() },
    })),
  },
}))

const request = (method: string, body?: unknown) => new NextRequest(
  'http://localhost/api/routes-b/invoices/inv-1/action',
  {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  },
)
const context = { params: Promise.resolve({ id: 'inv-1' }) }

describe('routes-b invoice actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthToken.mockResolvedValue({ userId: 'privy-1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
  })

  it('returns a subscription-backed retainer summary', async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 'inv-1', status: 'pending', subscription: {
        id: 'sub-1', description: 'Design retainer', amount: 500,
        currency: 'USD', frequency: 'monthly', interval: 1, status: 'active',
        nextGenerationDate: new Date('2026-09-01'), lastGeneratedAt: null,
      },
    })
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/retainer/route')
    const response = await GET(request('GET'), context)
    expect(response.status).toBe(200)
    expect((await response.json()).retainer).toMatchObject({ id: 'sub-1', amount: 500, invoiceStatus: 'pending' })
  })

  it('lists invoice delivery attempts for the owner', async () => {
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1' })
    paymentReminderFindMany.mockResolvedValue([{ id: 'delivery-1', reminderType: 'manual' }])
    const { GET } = await import('@/app/api/routes-b/invoices/[id]/deliveries/route')
    const response = await GET(request('GET'), context)
    expect(response.status).toBe(200)
    expect((await response.json()).deliveries).toHaveLength(1)
    expect(paymentReminderFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { invoiceId: 'inv-1' } }))
  })

  it('rejects an invalid tip and increments the invoice for a valid tip', async () => {
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', status: 'pending', currency: 'USD' })
    const { POST } = await import('@/app/api/routes-b/invoices/[id]/tip/route')
    expect((await POST(request('POST', { amount: 0 }), context)).status).toBe(400)
    invoiceUpdate.mockResolvedValue({ id: 'inv-1', amount: 125, currency: 'USD' })
    const response = await POST(request('POST', { amount: 25 }), context)
    expect(response.status).toBe(201)
    expect(invoiceUpdate).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { amount: { increment: 25 } } })
  })

  it('marks a pending invoice paid and creates a completed transaction', async () => {
    invoiceFindFirst.mockResolvedValue({ id: 'inv-1', userId: 'user-1', status: 'pending', amount: 100, currency: 'USD' })
    invoiceUpdateMany.mockResolvedValue({ count: 1 })
    transactionCreate.mockResolvedValue({ id: 'tx-1', amount: 100, currency: 'USD', status: 'completed', completedAt: new Date() })
    const { PATCH } = await import('@/app/api/routes-b/invoices/[id]/mark-paid/route')
    const response = await PATCH(request('PATCH'), context)
    expect(response.status).toBe(200)
    expect((await response.json()).invoice.status).toBe('paid')
    expect(transactionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ invoiceId: 'inv-1', status: 'completed' }) }))
  })

  it('returns 404 for an invoice the caller does not own', async () => {
    invoiceFindFirst.mockResolvedValue(null)
    const { PATCH } = await import('@/app/api/routes-b/invoices/[id]/mark-paid/route')
    expect((await PATCH(request('PATCH'), context)).status).toBe(404)
  })
})