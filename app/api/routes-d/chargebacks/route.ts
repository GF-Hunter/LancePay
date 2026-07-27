import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-d/chargebacks — list chargebacks filed by the authenticated user
// POST /api/routes-d/chargebacks — file a new chargeback

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

const VALID_REASONS = ['unauthorized', 'duplicate', 'not_delivered', 'defective', 'other']

const db = prisma as unknown as {
  chargeback: {
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const chargebacks = await db.chargeback.findMany({
      where: { userId: user.id },
      select: { id: true, transactionId: true, reason: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    logger.info({ userId: user.id }, 'GET /api/routes-d/chargebacks')
    return NextResponse.json({ chargebacks })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/chargebacks error')
    return NextResponse.json({ error: 'Failed to fetch chargebacks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as {
      transactionId?: string
      reason?: string
      description?: string
    } | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { transactionId, reason, description } = body

    if (!transactionId || typeof transactionId !== 'string' || !transactionId.trim()) {
      return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
    }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: `reason must be one of: ${VALID_REASONS.join(', ')}` },
        { status: 400 },
      )
    }

    const chargeback = await db.chargeback.create({
      data: {
        userId: user.id,
        transactionId: transactionId.trim(),
        reason,
        description: typeof description === 'string' ? description.trim() || null : null,
        status: 'pending',
      },
      select: { id: true, transactionId: true, reason: true, status: true, createdAt: true },
    })

    logger.info({ userId: user.id, chargebackId: chargeback.id }, 'POST /api/routes-d/chargebacks filed')
    return NextResponse.json({ chargeback }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/chargebacks error')
    return NextResponse.json({ error: 'Failed to file chargeback' }, { status: 500 })
  }
}
