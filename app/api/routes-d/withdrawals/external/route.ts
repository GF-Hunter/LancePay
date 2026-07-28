import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// POST /api/routes-d/withdrawals/external - send a withdrawal to an external address

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as {
      amount?: number
      address?: string
      asset?: string
      memo?: string
    } | null

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { amount, address, asset = 'USDC', memo } = body

    if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return NextResponse.json({ error: 'Destination address is required' }, { status: 400 })
    }

    const withdrawal = await prisma.withdrawalTransaction.create({
      data: {
        userId: user.id,
        anchorId: 'external_transfer',
        amount,
        asset,
        status: 'pending',
        withdrawAddress: address.trim(),
        withdrawMemo: memo ? memo.trim() : null,
      },
    })

    return NextResponse.json(
      {
        message: 'External withdrawal initiated successfully',
        withdrawal: {
          id: withdrawal.id,
          amount: Number(withdrawal.amount),
          asset: withdrawal.asset,
          status: withdrawal.status,
          withdrawAddress: withdrawal.withdrawAddress,
          createdAt: withdrawal.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error({ err: error }, 'External withdrawal error')
    return NextResponse.json({ error: 'Failed to initiate external withdrawal' }, { status: 500 })
  }
}
