import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

const now = new Date()
const pastDate = new Date(now.getTime() - 86400000) // 1 day ago
const futureDate = new Date(now.getTime() + 86400000) // 1 day from now

const mockInvoices = [
  {
    id: 'inv-1',
    amount: 1000,
    status: 'paid',
    dueDate: futureDate,
    createdAt: new Date(),
    clientId: 'client-1',
  },
  {
    id: 'inv-2',
    amount: 500,
    status: 'pending',
    dueDate: futureDate,
    createdAt: new Date(),
    clientId: 'client-2',
  },
  {
    id: 'inv-3',
    amount: 300,
    status: 'overdue',
    dueDate: pastDate,
    createdAt: new Date(),
    clientId: 'client-1',
  },
  {
    id: 'inv-4',
    amount: 200,
    status: 'cancelled',
    dueDate: futureDate,
    createdAt: new Date(),
    clientId: 'client-3',
  },
]

function makeGet() {
  return new NextRequest('http://localhost/api/routes-b/analytics/invoices', {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
})

describe('GET /api/routes-b/analytics/invoices', () => {
  it('returns invoice analytics for authenticated user', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totalInvoices).toBe(4)
    expect(data.totalAmount).toBe(2000)
    expect(data.paidAmount).toBe(1000)
    expect(data.pendingAmount).toBe(500)
    expect(data.overdueAmount).toBe(300)
    expect(data.cancelledAmount).toBe(200)
    expect(data.byStatus.paid).toBe(1)
    expect(data.byStatus.pending).toBe(1)
    expect(data.byStatus.overdue).toBe(1)
    expect(data.byStatus.cancelled).toBe(1)
    expect(Array.isArray(data.invoices)).toBe(true)
  })

  it('returns 401 when no auth token provided', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/analytics/invoices')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 401 when token is invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Invalid token')
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('User not found')
  })

  it('returns zero analytics when user has no invoices', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([])
    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totalInvoices).toBe(0)
    expect(data.totalAmount).toBe(0)
    expect(data.paidAmount).toBe(0)
    expect(data.invoices.length).toBe(0)
  })

  it('categorizes invoices by status correctly', async () => {
    const invoices = [
      {
        id: 'inv-1',
        amount: 100,
        status: 'paid',
        dueDate: futureDate,
        createdAt: new Date(),
        clientId: 'client-1',
      },
      {
        id: 'inv-2',
        amount: 200,
        status: 'pending',
        dueDate: futureDate,
        createdAt: new Date(),
        clientId: 'client-1',
      },
      {
        id: 'inv-3',
        amount: 300,
        status: 'overdue',
        dueDate: pastDate,
        createdAt: new Date(),
        clientId: 'client-1',
      },
    ]

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoices as never)
    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.byStatus.paid).toBe(1)
    expect(data.byStatus.pending).toBe(1)
    expect(data.byStatus.overdue).toBe(1)
    expect(data.byStatus.cancelled).toBe(0)
  })

  it('distinguishes between pending and overdue based on dueDate', async () => {
    const invoices = [
      {
        id: 'inv-1',
        amount: 500,
        status: 'pending',
        dueDate: futureDate,
        createdAt: new Date(),
        clientId: 'client-1',
      },
      {
        id: 'inv-2',
        amount: 500,
        status: 'pending',
        dueDate: pastDate,
        createdAt: new Date(),
        clientId: 'client-1',
      },
    ]

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoices as never)
    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.byStatus.pending).toBe(1)
    expect(data.byStatus.overdue).toBe(1)
    expect(data.pendingAmount).toBe(500)
    expect(data.overdueAmount).toBe(500)
  })

  it('calculates correct totals across all statuses', async () => {
    const invoices = [
      {
        id: 'inv-1',
        amount: 1000,
        status: 'paid',
        dueDate: futureDate,
        createdAt: new Date(),
        clientId: 'client-1',
      },
      {
        id: 'inv-2',
        amount: 2000,
        status: 'pending',
        dueDate: futureDate,
        createdAt: new Date(),
        clientId: 'client-1',
      },
      {
        id: 'inv-3',
        amount: 500,
        status: 'cancelled',
        dueDate: futureDate,
        createdAt: new Date(),
        clientId: 'client-1',
      },
    ]

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoices as never)
    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.totalAmount).toBe(3500)
    expect(data.totalInvoices).toBe(3)
  })
})
