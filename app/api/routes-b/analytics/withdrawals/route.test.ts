import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    withdrawalTransaction: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

const now = new Date()
const oneHourAgo = new Date(now.getTime() - 3600000)
const twoHoursAgo = new Date(now.getTime() - 7200000)

const mockWithdrawals = [
  {
    id: 'wd-1',
    amount: new Decimal('1000'),
    asset: 'USDC',
    status: 'completed',
    anchorId: 'moneygram',
    withdrawType: 'bank_transfer',
    createdAt: twoHoursAgo,
    completedAt: oneHourAgo,
  },
  {
    id: 'wd-2',
    amount: new Decimal('500'),
    asset: 'USDC',
    status: 'pending',
    anchorId: 'yellowcard',
    withdrawType: 'bank_transfer',
    createdAt: now,
    completedAt: null,
  },
  {
    id: 'wd-3',
    amount: new Decimal('750'),
    asset: 'USDC',
    status: 'completed',
    anchorId: 'moneygram',
    withdrawType: 'cash',
    createdAt: twoHoursAgo,
    completedAt: oneHourAgo,
  },
  {
    id: 'wd-4',
    amount: new Decimal('200'),
    asset: 'USDC',
    status: 'failed',
    anchorId: 'yellowcard',
    withdrawType: 'bank_transfer',
    createdAt: now,
    completedAt: null,
  },
]

function makeGet() {
  return new NextRequest('http://localhost/api/routes-b/analytics/withdrawals', {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
})

describe('GET /api/routes-b/analytics/withdrawals', () => {
  it('returns withdrawal analytics for authenticated user', async () => {
    vi.mocked(prisma.withdrawalTransaction.findMany).mockResolvedValue(
      mockWithdrawals as never,
    )

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totalWithdrawals).toBe(4)
    expect(data.totalAmount).toBe(2450)
    expect(data.completedAmount).toBe(1750)
    expect(data.pendingAmount).toBe(500)
    expect(data.failedAmount).toBe(200)
    expect(data.byStatus.completed).toBe(2)
    expect(data.byStatus.pending).toBe(1)
    expect(data.byStatus.failed).toBe(1)
    expect(Array.isArray(data.withdrawals)).toBe(true)
  })

  it('returns 401 when no auth token provided', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/analytics/withdrawals')
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

  it('returns zero analytics when user has no withdrawals', async () => {
    vi.mocked(prisma.withdrawalTransaction.findMany).mockResolvedValue([])
    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totalWithdrawals).toBe(0)
    expect(data.totalAmount).toBe(0)
    expect(data.completedAmount).toBe(0)
    expect(data.withdrawals.length).toBe(0)
  })

  it('categorizes withdrawals by status correctly', async () => {
    vi.mocked(prisma.withdrawalTransaction.findMany).mockResolvedValue(
      mockWithdrawals as never,
    )
    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.byStatus.pending).toBe(1)
    expect(data.byStatus.completed).toBe(2)
    expect(data.byStatus.failed).toBe(1)
    expect(data.byStatus.interactive).toBe(0)
    expect(data.byStatus.submitted).toBe(0)
  })

  it('groups withdrawals by asset correctly', async () => {
    vi.mocked(prisma.withdrawalTransaction.findMany).mockResolvedValue(
      mockWithdrawals as never,
    )
    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.byAsset.USDC).toBeDefined()
    expect(data.byAsset.USDC.count).toBe(4)
    expect(data.byAsset.USDC.amount).toBe(2450)
  })

  it('groups withdrawals by anchor correctly', async () => {
    vi.mocked(prisma.withdrawalTransaction.findMany).mockResolvedValue(
      mockWithdrawals as never,
    )
    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.byAnchor.moneygram).toBeDefined()
    expect(data.byAnchor.moneygram.count).toBe(2)
    expect(data.byAnchor.moneygram.amount).toBe(1750)

    expect(data.byAnchor.yellowcard).toBeDefined()
    expect(data.byAnchor.yellowcard.count).toBe(2)
    expect(data.byAnchor.yellowcard.amount).toBe(700)
  })

  it('calculates average completion time for completed withdrawals', async () => {
    vi.mocked(prisma.withdrawalTransaction.findMany).mockResolvedValue(
      mockWithdrawals as never,
    )
    const res = await GET(makeGet())
    const data = await res.json()

    expect(typeof data.avgCompletionTime).toBe('number')
    expect(data.avgCompletionTime).toBeGreaterThan(0)
  })

  it('returns zero average completion time when no completed withdrawals', async () => {
    const withdrawalsNoneCompleted = [
      {
        id: 'wd-1',
        amount: new Decimal('500'),
        asset: 'USDC',
        status: 'pending',
        anchorId: 'moneygram',
        withdrawType: 'bank_transfer',
        createdAt: now,
        completedAt: null,
      },
    ]

    vi.mocked(prisma.withdrawalTransaction.findMany).mockResolvedValue(
      withdrawalsNoneCompleted as never,
    )
    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.avgCompletionTime).toBe(0)
  })

  it('tracks pending and interactive statuses separately', async () => {
    const withdrawalsWithInteractive = [
      {
        id: 'wd-1',
        amount: new Decimal('100'),
        asset: 'USDC',
        status: 'pending',
        anchorId: 'moneygram',
        withdrawType: 'bank_transfer',
        createdAt: now,
        completedAt: null,
      },
      {
        id: 'wd-2',
        amount: new Decimal('200'),
        asset: 'USDC',
        status: 'interactive',
        anchorId: 'yellowcard',
        withdrawType: 'bank_transfer',
        createdAt: now,
        completedAt: null,
      },
      {
        id: 'wd-3',
        amount: new Decimal('300'),
        asset: 'USDC',
        status: 'submitted',
        anchorId: 'moneygram',
        withdrawType: 'bank_transfer',
        createdAt: now,
        completedAt: null,
      },
    ]

    vi.mocked(prisma.withdrawalTransaction.findMany).mockResolvedValue(
      withdrawalsWithInteractive as never,
    )
    const res = await GET(makeGet())
    const data = await res.json()

    expect(data.byStatus.pending).toBe(1)
    expect(data.byStatus.interactive).toBe(1)
    expect(data.byStatus.submitted).toBe(1)
    expect(data.pendingAmount).toBe(600)
  })
})
