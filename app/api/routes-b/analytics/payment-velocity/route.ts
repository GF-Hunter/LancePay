import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/analytics/payment-velocity - payment velocity metric

const DEFAULT_DAYS = 30
const MAX_DAYS = 365
const MS_PER_DAY = 24 * 60 * 60 * 1000

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

    const since = new Date(Date.now() - days * MS_PER_DAY)

    const paidInvoices = await prisma.invoice.findMany({
      where: { userId: user.id, status: 'paid', createdAt: { gte: since }, paidAt: { not: null } },
      select: { createdAt: true, paidAt: true },
    })

    let averageDaysToPay = 0
    if (paidInvoices.length > 0) {
      const totalDays = paidInvoices.reduce((sum, inv) => {
        const paidAt = inv.paidAt as Date
        return sum + (paidAt.getTime() - inv.createdAt.getTime()) / MS_PER_DAY
      }, 0)
      averageDaysToPay = totalDays / paidInvoices.length
    }

    const paymentsPerDay = days > 0 ? paidInvoices.length / days : 0

    return NextResponse.json({
      metric: {
        days,
        paidInvoiceCount: paidInvoices.length,
        averageDaysToPay: Math.round(averageDaysToPay * 100) / 100,
        paymentsPerDay: Math.round(paymentsPerDay * 10000) / 10000,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Get payment velocity metric error')
    return NextResponse.json({ error: 'Failed to fetch payment velocity metric' }, { status: 500 })
  }
}
