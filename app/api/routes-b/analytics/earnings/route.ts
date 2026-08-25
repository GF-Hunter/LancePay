import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get all paid invoices for this user
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        userId: user.id,
        status: 'paid',
      },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { paidAt: 'asc' },
    })

    // Group earnings by date and calculate cumulative
    const earningsByDate: Record<string, { date: string; amount: number; count: number }> = {}
    let cumulativeEarnings = 0

    paidInvoices.forEach((invoice) => {
      const paidDate = invoice.paidAt || invoice.createdAt
      const dateStr = paidDate.toISOString().split('T')[0] // YYYY-MM-DD

      if (!earningsByDate[dateStr]) {
        earningsByDate[dateStr] = { date: dateStr, amount: 0, count: 0 }
      }

      const amount = Number(invoice.amount) || 0
      earningsByDate[dateStr].amount += amount
      earningsByDate[dateStr].count += 1
    })

    // Convert to array and add cumulative
    const timelineData = Object.values(earningsByDate).map((entry) => {
      cumulativeEarnings += entry.amount
      return {
        date: entry.date,
        dailyEarnings: entry.amount,
        invoiceCount: entry.count,
        cumulativeEarnings,
      }
    })

    // Calculate summary stats
    const totalEarnings = paidInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)
    const avgEarningsPerInvoice = paidInvoices.length > 0 ? totalEarnings / paidInvoices.length : 0

    // Calculate monthly breakdown
    const monthlyEarnings: Record<string, { month: string; amount: number; count: number }> = {}
    paidInvoices.forEach((invoice) => {
      const paidDate = invoice.paidAt || invoice.createdAt
      const monthStr = paidDate.toISOString().substring(0, 7) // YYYY-MM

      if (!monthlyEarnings[monthStr]) {
        monthlyEarnings[monthStr] = { month: monthStr, amount: 0, count: 0 }
      }

      const amount = Number(invoice.amount) || 0
      monthlyEarnings[monthStr].amount += amount
      monthlyEarnings[monthStr].count += 1
    })

    const monthly = Object.values(monthlyEarnings).sort((a, b) =>
      a.month.localeCompare(b.month),
    )

    // Growth rate (month-over-month if available)
    let growthRate = 0
    if (monthly.length >= 2) {
      const lastMonth = monthly[monthly.length - 1]
      const prevMonth = monthly[monthly.length - 2]
      if (prevMonth.amount > 0) {
        growthRate = ((lastMonth.amount - prevMonth.amount) / prevMonth.amount) * 100
      }
    }

    const analytics = {
      totalEarnings,
      totalInvoices: paidInvoices.length,
      avgEarningsPerInvoice,
      growthRate,
      timeline: timelineData,
      monthly,
    }

    return NextResponse.json(analytics)
  } catch (error) {
    logger.error({ err: error }, 'Get earnings analytics error')
    return NextResponse.json({ error: 'Failed to get earnings analytics' }, { status: 500 })
  }
}
