import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const currency = searchParams.get('currency')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')

    let limit = DEFAULT_LIMIT
    if (limitParam !== null) {
      limit = Number(limitParam)
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return NextResponse.json(
          { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
          { status: 400 }
        )
      }
    }

    let offset = 0
    if (offsetParam !== null) {
      offset = Number(offsetParam)
      if (!Number.isInteger(offset) || offset < 0) {
        return NextResponse.json({ error: 'offset must be a non-negative integer' }, { status: 400 })
      }
    }

    let fromDate: Date | undefined
    if (from !== null) {
      fromDate = new Date(from)
      if (Number.isNaN(fromDate.getTime())) {
        return NextResponse.json({ error: 'from must be a valid ISO 8601 date' }, { status: 400 })
      }
    }

    let toDate: Date | undefined
    if (to !== null) {
      toDate = new Date(to)
      if (Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ error: 'to must be a valid ISO 8601 date' }, { status: 400 })
      }
    }

    if (fromDate && toDate && fromDate > toDate) {
      return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
    }

    const where = {
      userId: user.id,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(currency ? { currency } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          txHash: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.transaction.count({ where }),
    ])

    return NextResponse.json({ transactions, total, limit, offset })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/wallet/transactions error')
    return NextResponse.json({ error: 'Failed to fetch wallet transactions' }, { status: 500 })
  }
}
