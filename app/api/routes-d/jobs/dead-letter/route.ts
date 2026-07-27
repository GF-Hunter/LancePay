import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-d/jobs/dead-letter — Retrieve dead-letter job queue entries for the authenticated user

export async function GET(request: NextRequest) {
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
      select: { id: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const pageParam = searchParams.get('page')
    const statusParam = searchParams.get('status') ?? 'dead'

    let limit = 50
    if (limitParam !== null) {
      limit = parseInt(limitParam, 10)
      if (isNaN(limit) || limit <= 0 || limit > 100) {
        return NextResponse.json({ error: 'Invalid limit parameter. Must be an integer between 1 and 100.' }, { status: 400 })
      }
    }

    let page = 1
    if (pageParam !== null) {
      page = parseInt(pageParam, 10)
      if (isNaN(page) || page <= 0) {
        return NextResponse.json({ error: 'Invalid page parameter. Must be a positive integer.' }, { status: 400 })
      }
    }

    const offset = (page - 1) * limit

    const db = prisma as unknown as {
      webhookDelivery: {
        findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
        count: (args: Record<string, unknown>) => Promise<number>
      }
    }

    const whereClause: Record<string, unknown> = {
      webhook: { userId: user.id },
      status: statusParam === 'all' ? { in: ['dead', 'failed'] } : statusParam,
    }

    const [deliveries, totalCount] = await Promise.all([
      db.webhookDelivery.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          webhookId: true,
          eventType: true,
          payload: true,
          status: true,
          attemptCount: true,
          lastAttemptAt: true,
          lastStatusCode: true,
          lastError: true,
          createdAt: true,
        },
      }),
      db.webhookDelivery.count({ where: whereClause }),
    ])

    const jobs = deliveries.map((d) => ({
      id: d.id,
      queue: 'webhooks',
      webhookId: d.webhookId,
      eventType: d.eventType,
      payload: d.payload,
      status: d.status,
      attemptCount: d.attemptCount,
      lastAttemptAt: d.lastAttemptAt,
      lastStatusCode: d.lastStatusCode,
      lastError: d.lastError,
      createdAt: d.createdAt,
    }))

    logger.info({ userId: user.id, count: jobs.length, total: totalCount }, 'GET /api/routes-d/jobs/dead-letter succeeded')

    return NextResponse.json({
      jobs,
      total: totalCount,
      page,
      limit,
    }, { status: 200 })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/jobs/dead-letter error')
    return NextResponse.json({ error: 'Failed to fetch dead-letter jobs' }, { status: 500 })
  }
}
