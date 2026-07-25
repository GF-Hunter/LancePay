import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const skip = (page - 1) * limit

    const [errors, total] = await Promise.all([
      prisma.bankFeedSync.findMany({
        where: {
          userId: user.id,
          lastError: { not: null },
        },
        select: {
          id: true,
          bankAccountId: true,
          lastError: true,
          lastSyncedAt: true,
          updatedAt: true,
          bankAccount: {
            select: {
              bankName: true,
              accountNumber: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bankFeedSync.count({
        where: {
          userId: user.id,
          lastError: { not: null },
        },
      }),
    ])

    const formattedErrors = errors.map((error) => ({
      syncId: error.id,
      bankAccountId: error.bankAccountId,
      bankName: error.bankAccount.bankName,
      accountNumber: error.bankAccount.accountNumber,
      errorMessage: error.lastError,
      occurredAt: error.updatedAt,
    }))

    return NextResponse.json({
      errors: formattedErrors,
      total,
      page,
      limit,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/bank-feeds/errors error')
    return NextResponse.json({ error: 'Failed to fetch bank feed errors' }, { status: 500 })
  }
}
