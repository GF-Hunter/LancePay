import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const VALID_CATEGORIES = ['income', 'expense', 'withdrawal', 'deposit', 'transfer', 'payment', 'refund']

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { transactionIds = [], category } = await request.json()

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json(
        { error: 'Transaction IDs must be a non-empty array' },
        { status: 400 },
      )
    }

    if (transactionIds.length > 100) {
      return NextResponse.json(
        { error: 'Cannot categorize more than 100 transactions at once' },
        { status: 400 },
      )
    }

    if (!category || typeof category !== 'string') {
      return NextResponse.json(
        { error: 'Category is required and must be a string' },
        { status: 400 },
      )
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Supported: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 },
      )
    }

    const existingTransactions = await prisma.transaction.findMany({
      where: {
        id: { in: transactionIds },
        userId: user.id,
      },
      select: { id: true },
    })

    if (existingTransactions.length !== transactionIds.length) {
      return NextResponse.json(
        { error: 'Some transactions not found or unauthorized' },
        { status: 404 },
      )
    }

    const updated = await prisma.transaction.updateMany({
      where: {
        id: { in: transactionIds },
        userId: user.id,
      },
      data: {
        type: category,
      },
    })

    return NextResponse.json(
      {
        message: 'Transactions categorized successfully',
        count: updated.count,
        category,
        transactionIds,
      },
      { status: 200 },
    )
  } catch (error) {
    logger.error({ err: error }, 'Bulk categorize transactions error')
    return NextResponse.json({ error: 'Failed to categorize transactions' }, { status: 500 })
  }
}
