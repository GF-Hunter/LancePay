import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET /api/routes-d/currencies/conversion-history — currency conversion history ──

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
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
    const currency = searchParams.get('currency')?.trim().toUpperCase() || undefined

    const where: Record<string, unknown> = {
      userId: user.id,
      type: 'conversion',
    }
    if (currency) {
      where.currency = currency
    }

    const conversions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        currency: true,
        amount: true,
        ngnAmount: true,
        exchangeRate: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    })

    return NextResponse.json({
      conversions: conversions.map((row) => ({
        id: row.id,
        currency: row.currency,
        amount: row.amount?.toString?.() ?? row.amount,
        convertedAmount: row.ngnAmount?.toString?.() ?? row.ngnAmount,
        exchangeRate: row.exchangeRate?.toString?.() ?? row.exchangeRate,
        status: row.status,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
      })),
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/currencies/conversion-history error')
    return NextResponse.json({ error: 'Failed to fetch conversion history' }, { status: 500 })
  }
}
