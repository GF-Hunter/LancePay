import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/analytics/dso - days-sales-outstanding metric

const DEFAULT_DAYS = 90
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
      select: { amount: true, createdAt: true, paidAt: true },
    })

    const totalReceivables = paidInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0)

    let dso = 0
    if (paidInvoices.length > 0 && totalReceivables > 0) {
      const weightedDays = paidInvoices.reduce((sum, inv) => {
        const paidAt = inv.paidAt as Date
        const collectionDays = (paidAt.getTime() - inv.createdAt.getTime()) / MS_PER_DAY
        return sum + collectionDays * Number(inv.amount || 0)
      }, 0)
      dso = weightedDays / totalReceivables
    }

    return NextResponse.json({
      metric: {
        days,
        invoicesConsidered: paidInvoices.length,
        totalReceivables,
        dso: Math.round(dso * 100) / 100,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Get DSO metric error')
    return NextResponse.json({ error: 'Failed to fetch DSO metric' }, { status: 500 })
  }
}
