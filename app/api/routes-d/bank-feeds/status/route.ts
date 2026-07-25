import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET /api/routes-d/bank-feeds/status — bank feed sync status ──
//
// Reports the sync status of every bank account owned by the authenticated
// user. Accounts that have never been synced yet (no BankFeedSync row) are
// reported as "not_connected" rather than erroring.

const STATUS_PRIORITY = ['error', 'syncing', 'not_connected', 'idle'] as const

function overallStatus(statuses: string[]): (typeof STATUS_PRIORITY)[number] | 'idle' {
  for (const status of STATUS_PRIORITY) {
    if (statuses.includes(status)) return status
  }
  return 'idle'
}

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const bankAccounts = await prisma.bankAccount.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        bankName: true,
        accountNumber: true,
        feedSync: {
          select: {
            status: true,
            lastSyncedAt: true,
            lastError: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const feeds = bankAccounts.map((account) => ({
      bankAccountId: account.id,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      status: account.feedSync?.status ?? 'not_connected',
      lastSyncedAt: account.feedSync?.lastSyncedAt ?? null,
      lastError: account.feedSync?.lastError ?? null,
    }))

    return NextResponse.json({
      status: overallStatus(feeds.map((f) => f.status)),
      feeds,
    })
  } catch (error) {
    logger.error({ err: error }, 'Bank feeds status GET error')
    return NextResponse.json({ error: 'Failed to get bank feed sync status' }, { status: 500 })
  }
}
