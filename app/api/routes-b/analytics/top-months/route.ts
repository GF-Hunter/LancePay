import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/analytics/top-months — top earning months for the
// authenticated user, ranked by total paid invoice amount.
//
// Query params (optional):
//   limit — number of months to return, 1–24 (default: 5)

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 24

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return DEFAULT_LIMIT
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.min(n, MAX_LIMIT)
}

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const limit = parseLimit(searchParams.get('limit'))
    if (limit === undefined) {
      return NextResponse.json({ error: 'Invalid limit parameter' }, { status: 400 })
    }

    const paidInvoices = await prisma.invoice.findMany({
      where: { userId: user.id, status: 'paid' },
      select: { amount: true, paidAt: true, createdAt: true },
    })

    const monthlyMap = new Map<string, { year: number; month: number; totalAmount: number; invoiceCount: number }>()

    for (const inv of paidInvoices) {
      const date = new Date(inv.paidAt ?? inv.createdAt)
      const year = date.getUTCFullYear()
      const month = date.getUTCMonth() + 1
      const key = `${year}-${month}`

      const existing = monthlyMap.get(key) || { year, month, totalAmount: 0, invoiceCount: 0 }
      existing.totalAmount += Number(inv.amount || 0)
      existing.invoiceCount += 1
      monthlyMap.set(key, existing)
    }

    const topMonths = Array.from(monthlyMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit)
      .map((m) => ({
        year: m.year,
        month: m.month,
        monthName: new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleString('default', {
          month: 'long',
          timeZone: 'UTC',
        }),
        totalAmount: m.totalAmount,
        invoiceCount: m.invoiceCount,
      }))

    return NextResponse.json({ topMonths })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/analytics/top-months error')
    return NextResponse.json({ error: 'Failed to fetch top earning months' }, { status: 500 })
  }
}
