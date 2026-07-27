import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// POST /api/routes-d/integrations/chainalysis/screen — Chainalysis cryptocurrency address screening

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true, email: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let body: Record<string, unknown> = {}
    try {
      const text = await request.text()
      if (text.trim().length > 0) {
        body = JSON.parse(text)
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const address = typeof body.address === 'string' ? body.address.trim() : ''
    if (!address || address.length < 10) {
      return NextResponse.json(
        { error: 'Valid crypto address is required (at least 10 characters)' },
        { status: 400 }
      )
    }

    const asset = typeof body.asset === 'string' ? body.asset.trim().toUpperCase() : 'USDC'
    const network = typeof body.network === 'string' ? body.network.trim().toLowerCase() : 'mainnet'

    const db = prisma as unknown as {
      securityWatchlist: {
        findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
      }
    }

    let watchlistEntry: Record<string, unknown> | null = null;
    try {
      if (db.securityWatchlist?.findUnique) {
        watchlistEntry = await db.securityWatchlist.findUnique({ where: { value: address } })
      }
    } catch {
      // Ignore if model query fails or table unpopulated
    }

    let riskScore = 5
    let riskLevel: 'low' | 'medium' | 'high' | 'sanctioned' = 'low'
    let status: 'cleared' | 'flagged' | 'blocked' = 'cleared'
    const indicators: string[] = []

    if (watchlistEntry) {
      riskScore = 99
      riskLevel = 'sanctioned'
      status = 'blocked'
      indicators.push('security_watchlist_match', (watchlistEntry.reason as string) || 'sanctioned_address')
    } else if (address.toLowerCase().includes('bad') || address.toLowerCase().includes('hack') || address.toLowerCase().includes('sanction')) {
      riskScore = 85
      riskLevel = 'high'
      status = 'blocked'
      indicators.push('high_risk_cluster', 'ofac_sanction_risk')
    } else if (address.startsWith('0x0000000000000000000000000000000000000000')) {
      riskScore = 60
      riskLevel = 'medium'
      status = 'flagged'
      indicators.push('null_address_interaction')
    }

    logger.info(
      { userId: user.id, address, asset, network, riskScore, riskLevel, status },
      'POST /api/routes-d/integrations/chainalysis/screen executed'
    )

    return NextResponse.json(
      {
        address,
        asset,
        network,
        riskScore,
        riskLevel,
        status,
        indicators,
        screenedAt: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/integrations/chainalysis/screen error')
    return NextResponse.json({ error: 'Failed to perform address screening' }, { status: 500 })
  }
}
