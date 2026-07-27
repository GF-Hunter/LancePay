import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET  /api/routes-d/wallet/threshold-alerts — list balance threshold alerts ──
// ── POST /api/routes-d/wallet/threshold-alerts — create a balance threshold alert ──

const VALID_DIRECTIONS = ['below', 'above'] as const
type Direction = typeof VALID_DIRECTIONS[number]

const CURRENCY_PATTERN = /^[A-Z]{2,8}$/
const MAX_THRESHOLD = 1_000_000_000

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return { user: null, invalid: false }
  const claims = await verifyAuthToken(authToken)
  if (!claims) return { user: null, invalid: true }
  const user = await prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
  return { user, invalid: false }
}

export async function GET(request: NextRequest) {
  try {
    const { user, invalid } = await getAuthenticatedUser(request)
    if (invalid) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const alerts = await prisma.balanceThresholdAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        currency: true,
        direction: true,
        threshold: true,
        enabled: true,
        lastTriggeredAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      alerts: alerts.map((alert) => ({
        ...alert,
        threshold: alert.threshold?.toString?.() ?? alert.threshold,
      })),
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/wallet/threshold-alerts error')
    return NextResponse.json({ error: 'Failed to list threshold alerts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, invalid } = await getAuthenticatedUser(request)
    if (invalid) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as
      | { currency?: string; direction?: string; threshold?: number }
      | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { direction, threshold } = body
    const currency = (body.currency ?? 'USD').trim().toUpperCase()

    if (!CURRENCY_PATTERN.test(currency)) {
      return NextResponse.json(
        { error: 'currency must be 2-8 uppercase letters' },
        { status: 400 },
      )
    }

    if (typeof direction !== 'string' || !VALID_DIRECTIONS.includes(direction as Direction)) {
      return NextResponse.json(
        { error: `direction must be one of: ${VALID_DIRECTIONS.join(', ')}` },
        { status: 400 },
      )
    }

    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0) {
      return NextResponse.json({ error: 'threshold must be a positive number' }, { status: 400 })
    }

    if (threshold > MAX_THRESHOLD) {
      return NextResponse.json(
        { error: `threshold must be at most ${MAX_THRESHOLD}` },
        { status: 400 },
      )
    }

    const alert = await prisma.balanceThresholdAlert.create({
      data: {
        userId: user.id,
        currency,
        direction,
        threshold,
        enabled: true,
      },
      select: {
        id: true,
        currency: true,
        direction: true,
        threshold: true,
        enabled: true,
        lastTriggeredAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      { alert: { ...alert, threshold: alert.threshold?.toString?.() ?? alert.threshold } },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/wallet/threshold-alerts error')
    return NextResponse.json({ error: 'Failed to create threshold alert' }, { status: 500 })
  }
}
