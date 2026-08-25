import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/analytics/dispute-rate - dispute rate metric

const DEFAULT_DAYS = 30
const MAX_DAYS = 365

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const daysParam = searchParams.get('days')

    let days = DEFAULT_DAYS
    if (daysParam !== null) {
      days = Number(daysParam)
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        return NextResponse.json(
          { error: `days must be an integer between 1 and ${MAX_DAYS}` },
          { status: 400 },
        )
      }
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [totalInvoices, disputedInvoices] = await Promise.all([
      prisma.invoice.count({
        where: { userId: user.id, createdAt: { gte: since } },
      }),
      prisma.invoice.count({
        where: { userId: user.id, createdAt: { gte: since }, dispute: { isNot: null } },
      }),
    ])

    const disputeRate = totalInvoices > 0 ? disputedInvoices / totalInvoices : 0

    return NextResponse.json({
      metric: {
        days,
        totalInvoices,
        disputedInvoices,
        disputeRate: Math.round(disputeRate * 10000) / 10000,
        disputeRatePercentage: Math.round(disputeRate * 10000) / 100,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Get dispute rate metric error')
    return NextResponse.json({ error: 'Failed to fetch dispute rate metric' }, { status: 500 })
  }
}
