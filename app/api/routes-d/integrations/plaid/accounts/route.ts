import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET /api/routes-d/integrations/plaid/accounts — list connected Plaid accounts ──
//
// Returns every Plaid-linked account owned by the authenticated user.

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const plaidAccounts = await prisma.plaidAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    })

    const accounts = plaidAccounts.map((account) => ({
      id: account.id,
      institutionName: account.institutionName,
      accountName: account.accountName,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      status: account.status,
      lastSyncedAt: account.lastSyncedAt,
    }))

    return NextResponse.json({ accounts })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/integrations/plaid/accounts error')
    return NextResponse.json(
      { error: 'Failed to list connected Plaid accounts' },
      { status: 500 },
    )
  }
}
