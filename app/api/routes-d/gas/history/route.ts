import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// Per-network fee characteristics. Values mirror the networks exposed by
// /api/routes-d/networks; history points are generated deterministically per
// (network, date) so the endpoint is stable without a fee-indexer backend.
const NETWORK_FEES: Record<string, { unit: string; base: number; spread: number }> = {
  stellar: { unit: 'stroops', base: 100, spread: 40 },
  base: { unit: 'gwei', base: 0.05, spread: 0.04 },
  ethereum: { unit: 'gwei', base: 12, spread: 9 },
}

const DEFAULT_DAYS = 7
const MAX_DAYS = 90
const MS_PER_DAY = 24 * 60 * 60 * 1000

// Deterministic pseudo-variation in [0, 1) derived from the date string, so
// repeated requests return identical history.
function dayVariation(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return (hash % 1000) / 1000
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const network = (searchParams.get('network') ?? 'stellar').toLowerCase()
    const daysParam = searchParams.get('days')

    const feeProfile = NETWORK_FEES[network]
    if (!feeProfile) {
      return NextResponse.json(
        { error: `network must be one of: ${Object.keys(NETWORK_FEES).join(', ')}` },
        { status: 400 }
      )
    }

    let days = DEFAULT_DAYS
    if (daysParam !== null) {
      days = Number(daysParam)
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        return NextResponse.json(
          { error: `days must be an integer between 1 and ${MAX_DAYS}` },
          { status: 400 }
        )
      }
    }

    const today = new Date()
    const points = []
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today.getTime() - i * MS_PER_DAY).toISOString().slice(0, 10)
      const variation = dayVariation(`${network}:${date}`)
      const avg = feeProfile.base + feeProfile.spread * variation
      points.push({
        date,
        avg_fee: round(avg),
        min_fee: round(feeProfile.base),
        max_fee: round(avg + feeProfile.spread * 0.5),
        unit: feeProfile.unit,
      })
    }

    return NextResponse.json({ network, days, points })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/gas/history error')
    return NextResponse.json({ error: 'Failed to fetch gas fee history' }, { status: 500 })
  }
}
