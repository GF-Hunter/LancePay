import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/automations/stats — aggregate automation stats for the
// authenticated user: total/active/inactive automation counts and run totals
// broken down by status.

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [totalAutomations, activeAutomations, runsByStatus, totalRuns] = await Promise.all([
      prisma.automation.count({ where: { userId: user.id } }),
      prisma.automation.count({ where: { userId: user.id, isActive: true } }),
      prisma.automationRun.groupBy({
        by: ['status'],
        where: { automation: { userId: user.id } },
        _count: { _all: true },
      }),
      prisma.automationRun.count({ where: { automation: { userId: user.id } } }),
    ])

    const runStatusCounts: Record<string, number> = {}
    for (const row of runsByStatus) {
      runStatusCounts[row.status] = row._count._all
    }

    return NextResponse.json({
      totalAutomations,
      activeAutomations,
      inactiveAutomations: totalAutomations - activeAutomations,
      totalRuns,
      runsByStatus: runStatusCounts,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/automations/stats error')
    return NextResponse.json({ error: 'Failed to fetch automation stats' }, { status: 500 })
  }
}
