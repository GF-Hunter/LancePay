import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/analytics/revenue-by-tag - revenue by tag report

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

    const invoiceTags = await prisma.invoiceTag.findMany({
      where: { invoice: { userId: user.id, createdAt: { gte: since } } },
      select: {
        tag: { select: { id: true, name: true, color: true } },
        invoice: { select: { id: true, amount: true, status: true } },
      },
    })

    const byTag = new Map<
      string,
      { tagId: string; name: string; color: string; totalRevenue: number; paidRevenue: number; invoiceCount: number }
    >()

    for (const { tag, invoice } of invoiceTags) {
      const amount = Number(invoice.amount || 0)
      const existing = byTag.get(tag.id) ?? {
        tagId: tag.id,
        name: tag.name,
        color: tag.color,
        totalRevenue: 0,
        paidRevenue: 0,
        invoiceCount: 0,
      }
      existing.totalRevenue += amount
      if (invoice.status === 'paid') existing.paidRevenue += amount
      existing.invoiceCount += 1
      byTag.set(tag.id, existing)
    }

    const tags = Array.from(byTag.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)

    return NextResponse.json({
      report: {
        days,
        tags,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Get revenue by tag report error')
    return NextResponse.json({ error: 'Failed to fetch revenue by tag report' }, { status: 500 })
  }
}
