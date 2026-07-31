import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const DEFAULT_DAYS = 30
const MAX_DAYS = 90
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MS_PER_DAY = 24 * 60 * 60 * 1000
// More distinct IPs than this within the window flags every session involved.
const DISTINCT_IP_THRESHOLD = 2

interface SuspiciousEvent {
  session_id: string
  type: 'revoked_session' | 'new_device' | 'multiple_ips'
  ip_address: string | null
  device_label: string | null
  user_agent: string | null
  detected_at: string
}

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const daysParam = searchParams.get('days')
    const limitParam = searchParams.get('limit')

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

    let limit = DEFAULT_LIMIT
    if (limitParam !== null) {
      limit = Number(limitParam)
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return NextResponse.json(
          { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
          { status: 400 }
        )
      }
    }

    const since = new Date(Date.now() - days * MS_PER_DAY)

    // Sessions inside the window, oldest first so "first time we saw this
    // device" is well defined; earlier sessions establish the known-device set.
    const [windowSessions, knownAgents] = await Promise.all([
      prisma.userSession.findMany({
        where: { userId: user.id, issuedAt: { gte: since } },
        orderBy: { issuedAt: 'asc' },
        select: {
          id: true,
          deviceLabel: true,
          userAgent: true,
          ipAddress: true,
          issuedAt: true,
          revokedAt: true,
        },
      }),
      prisma.userSession.findMany({
        where: { userId: user.id, issuedAt: { lt: since } },
        select: { userAgent: true },
        distinct: ['userAgent'],
      }),
    ])

    const seenAgents = new Set(
      knownAgents.map((s) => s.userAgent).filter((ua): ua is string => ua !== null)
    )

    const distinctIps = new Set(
      windowSessions.map((s) => s.ipAddress).filter((ip): ip is string => ip !== null)
    )
    const manyIps = distinctIps.size > DISTINCT_IP_THRESHOLD

    const events: SuspiciousEvent[] = []
    for (const session of windowSessions) {
      if (session.revokedAt !== null) {
        events.push({
          session_id: session.id,
          type: 'revoked_session',
          ip_address: session.ipAddress,
          device_label: session.deviceLabel,
          user_agent: session.userAgent,
          detected_at: session.revokedAt.toISOString(),
        })
      }
      if (session.userAgent !== null && !seenAgents.has(session.userAgent)) {
        seenAgents.add(session.userAgent)
        events.push({
          session_id: session.id,
          type: 'new_device',
          ip_address: session.ipAddress,
          device_label: session.deviceLabel,
          user_agent: session.userAgent,
          detected_at: session.issuedAt.toISOString(),
        })
      }
      if (manyIps && session.ipAddress !== null) {
        events.push({
          session_id: session.id,
          type: 'multiple_ips',
          ip_address: session.ipAddress,
          device_label: session.deviceLabel,
          user_agent: session.userAgent,
          detected_at: session.issuedAt.toISOString(),
        })
      }
    }

    // Newest first for display; cap at limit.
    events.sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at))

    return NextResponse.json({
      events: events.slice(0, limit),
      total: events.length,
      window_days: days,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/auth/suspicious-activity error')
    return NextResponse.json({ error: 'Failed to fetch suspicious activity' }, { status: 500 })
  }
}
