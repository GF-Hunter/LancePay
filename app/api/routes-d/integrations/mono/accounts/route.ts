import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET /api/routes-d/integrations/mono/accounts — list connected Mono accounts ──
//
// Returns every Mono-linked account owned by the authenticated user.

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Mono accounts use the PlaidAccount model with a mono provider reference
    const monoAccounts = await prisma.plaidAccount.findMany({
      where: {
        userId: user.id,
        plaidItemId: { startsWith: 'mono_' },
      },
      orderBy: { createdAt: 'asc' },
    })

    const accounts = monoAccounts.map((account) => ({
      id: account.id,
      institutionName: account.institutionName,
      accountName: account.accountName,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      status: account.status,
      lastSyncedAt: account.lastSyncedAt,
      connectedAt: account.createdAt,
    }))

    return NextResponse.json({ accounts })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/integrations/mono/accounts error')
    return NextResponse.json(
      { error: 'Failed to list connected Mono accounts' },
      { status: 500 },
    )
  }
}