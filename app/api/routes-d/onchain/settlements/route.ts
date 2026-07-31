import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET /api/routes-d/onchain/settlements — onchain settlement status ──

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const VALID_STATUSES = ['pending', 'completed', 'failed']

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
    const statusRaw = searchParams.get('status')?.trim().toLowerCase()

    if (statusRaw && !VALID_STATUSES.includes(statusRaw)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }

    const where: Record<string, unknown> = {
      userId: user.id,
      txHash: { not: null },
    }
    if (statusRaw) {
      where.status = statusRaw
    }

    const rows = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        txHash: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
        completedAt: true,
      },
    })

    return NextResponse.json({
      settlements: rows.map((row) => ({
        id: row.id,
        txHash: row.txHash,
        status: row.status,
        settled: row.status === 'completed',
        amount: row.amount?.toString?.() ?? row.amount,
        currency: row.currency,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
      })),
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/onchain/settlements error')
    return NextResponse.json({ error: 'Failed to fetch settlement status' }, { status: 500 })
  }
}
