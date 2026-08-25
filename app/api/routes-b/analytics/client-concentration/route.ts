import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/analytics/client-concentration - client concentration report

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

    const invoices = await prisma.invoice.findMany({
      where: { userId: user.id, createdAt: { gte: since }, status: 'paid' },
      select: { amount: true, clientEmail: true, clientName: true },
    })

    const byClient = new Map<
      string,
      { clientEmail: string; clientName: string | null; revenue: number; invoiceCount: number }
    >()

    let totalRevenue = 0
    for (const invoice of invoices) {
      const amount = Number(invoice.amount || 0)
      totalRevenue += amount
      const existing = byClient.get(invoice.clientEmail) ?? {
        clientEmail: invoice.clientEmail,
        clientName: invoice.clientName,
        revenue: 0,
        invoiceCount: 0,
      }
      existing.revenue += amount
      existing.invoiceCount += 1
      byClient.set(invoice.clientEmail, existing)
    }

    const clients = Array.from(byClient.values())
      .map((client) => ({
        ...client,
        revenueShare: totalRevenue > 0 ? Math.round((client.revenue / totalRevenue) * 10000) / 10000 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    // Herfindahl-Hirschman Index over revenue share (0 = perfectly diversified, 1 = single client)
    const herfindahlIndex =
      totalRevenue > 0
        ? Math.round(clients.reduce((sum, c) => sum + c.revenueShare ** 2, 0) * 10000) / 10000
        : 0

    const topClientRevenueShare = clients[0]?.revenueShare ?? 0
    const top5RevenueShare =
      Math.round(clients.slice(0, 5).reduce((sum, c) => sum + c.revenueShare, 0) * 10000) / 10000

    return NextResponse.json({
      report: {
        days,
        totalRevenue,
        totalClients: clients.length,
        herfindahlIndex,
        topClientRevenueShare,
        top5RevenueShare,
        clients,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Get client concentration report error')
    return NextResponse.json({ error: 'Failed to fetch client concentration report' }, { status: 500 })
  }
}
