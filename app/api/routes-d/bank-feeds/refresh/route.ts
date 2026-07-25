import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { bankAccountId } = await request.json()

    if (!bankAccountId || typeof bankAccountId !== 'string' || bankAccountId.trim() === '') {
      return NextResponse.json({ error: 'bankAccountId is required' }, { status: 400 })
    }

    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    })

    if (!bankAccount || bankAccount.userId !== user.id) {
      return NextResponse.json({ error: 'Bank account not found or unauthorized' }, { status: 404 })
    }

    const feedSync = await prisma.bankFeedSync.findUnique({
      where: { bankAccountId },
    })

    if (!feedSync) {
      return NextResponse.json({ error: 'Bank feed sync not found' }, { status: 404 })
    }

    const updated = await prisma.bankFeedSync.update({
      where: { id: feedSync.id },
      data: {
        status: 'syncing',
        lastError: null,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(
      {
        message: 'Bank feed refresh triggered',
        syncId: updated.id,
        bankAccountId: updated.bankAccountId,
        status: updated.status,
      },
      { status: 200 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/bank-feeds/refresh error')
    return NextResponse.json({ error: 'Failed to trigger bank feed refresh' }, { status: 500 })
  }
}
