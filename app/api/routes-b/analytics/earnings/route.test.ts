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

const date1 = new Date('2026-01-15')
const date2 = new Date('2026-01-20')
const date3 = new Date('2026-02-10')
const date4 = new Date('2026-02-15')

const mockPaidInvoices = [
  {
    id: 'inv-1',
    amount: 1000,
    paidAt: date1,
    createdAt: date1,
  },
  {
    id: 'inv-2',
    amount: 1500,
    paidAt: date2,
    createdAt: date2,
  },
  {
    id: 'inv-3',
    amount: 2000,
    paidAt: date3,
    createdAt: date3,
  },
  {
    id: 'inv-4',
    amount: 500,
    paidAt: date4,
    createdAt: date4,
  },
]

function makeGet() {
  return new NextRequest('http://localhost/api/routes-b/analytics/earnings', {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
})

describe('GET /api/routes-b/analytics/earnings', () => {
  it('returns earnings analytics for authenticated user', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockPaidInvoices as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totalEarnings).toBe(5000)
    expect(data.totalInvoices).toBe(4)
    expect(data.avgEarningsPerInvoice).toBe(1250)
    expect(Array.isArray(data.timeline)).toBe(true)
    expect(Array.isArray(data.monthly)).toBe(true)
  })

  it('returns 401 when no auth token provided', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/analytics/earnings')
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

  it('returns zero analytics when user has no paid invoices', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([])
    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totalEarnings).toBe(0)
    expect(data.totalInvoices).toBe(0)
    expect(data.avgEarningsPerInvoice).toBe(0)
    expect(data.timeline.length).toBe(0)
    expect(data.monthly.length).toBe(0)
  })

  it('groups earnings by date correctly', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockPaidInvoices as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.timeline.length).toBe(4)
    expect(data.timeline[0].date).toBe('2026-01-15')
    expect(data.timeline[0].dailyEarnings).toBe(1000)
    expect(data.timeline[0].invoiceCount).toBe(1)
  })

  it('calculates cumulative earnings correctly', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockPaidInvoices as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.timeline[0].cumulativeEarnings).toBe(1000)
    expect(data.timeline[1].cumulativeEarnings).toBe(2500)
    expect(data.timeline[2].cumulativeEarnings).toBe(4500)
    expect(data.timeline[3].cumulativeEarnings).toBe(5000)
  })

  it('groups earnings by month correctly', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockPaidInvoices as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.monthly.length).toBe(2)
    expect(data.monthly[0].month).toBe('2026-01')
    expect(data.monthly[0].amount).toBe(2500)
    expect(data.monthly[0].count).toBe(2)
    expect(data.monthly[1].month).toBe('2026-02')
    expect(data.monthly[1].amount).toBe(2500)
    expect(data.monthly[1].count).toBe(2)
  })

  it('calculates month-over-month growth rate', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockPaidInvoices as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(typeof data.growthRate).toBe('number')
    expect(data.growthRate).toBe(0) // Same amount both months
  })

  it('calculates positive growth rate when current month earns more', async () => {
    const invoicesWithGrowth = [
      {
        id: 'inv-1',
        amount: 1000,
        paidAt: new Date('2026-01-15'),
        createdAt: new Date('2026-01-15'),
      },
      {
        id: 'inv-2',
        amount: 1500,
        paidAt: new Date('2026-02-15'),
        createdAt: new Date('2026-02-15'),
      },
    ]

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoicesWithGrowth as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.growthRate).toBe(50) // (1500 - 1000) / 1000 * 100
  })

  it('calculates negative growth rate when current month earns less', async () => {
    const invoicesWithDecline = [
      {
        id: 'inv-1',
        amount: 2000,
        paidAt: new Date('2026-01-15'),
        createdAt: new Date('2026-01-15'),
      },
      {
        id: 'inv-2',
        amount: 1000,
        paidAt: new Date('2026-02-15'),
        createdAt: new Date('2026-02-15'),
      },
    ]

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoicesWithDecline as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.growthRate).toBe(-50) // (1000 - 2000) / 2000 * 100
  })

  it('handles multiple invoices on same day', async () => {
    const invoicesSameDay = [
      {
        id: 'inv-1',
        amount: 500,
        paidAt: date1,
        createdAt: date1,
      },
      {
        id: 'inv-2',
        amount: 750,
        paidAt: date1,
        createdAt: date1,
      },
      {
        id: 'inv-3',
        amount: 250,
        paidAt: date1,
        createdAt: date1,
      },
    ]

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoicesSameDay as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.timeline.length).toBe(1)
    expect(data.timeline[0].dailyEarnings).toBe(1500)
    expect(data.timeline[0].invoiceCount).toBe(3)
  })

  it('uses createdAt when paidAt is null', async () => {
    const invoicesNoPaidAt = [
      {
        id: 'inv-1',
        amount: 1000,
        paidAt: null,
        createdAt: date1,
      },
    ]

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoicesNoPaidAt as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.timeline[0].date).toBe(date1.toISOString().split('T')[0])
    expect(data.totalEarnings).toBe(1000)
  })

  it('returns zero growth rate with only one month of data', async () => {
    const invoicesOneMonth = [
      {
        id: 'inv-1',
        amount: 1000,
        paidAt: date1,
        createdAt: date1,
      },
      {
        id: 'inv-2',
        amount: 500,
        paidAt: date2,
        createdAt: date2,
      },
    ]

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoicesOneMonth as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.growthRate).toBe(0)
  })
})
