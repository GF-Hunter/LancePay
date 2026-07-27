import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-d/wallet/snapshots — list wallet snapshots for the authenticated user
// POST /api/routes-d/wallet/snapshots — create a new wallet snapshot

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

const db = prisma as unknown as {
  walletSnapshot: {
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const snapshots = await db.walletSnapshot.findMany({
      where: { userId: user.id },
      select: { id: true, label: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    logger.info({ userId: user.id }, 'GET /api/routes-d/wallet/snapshots')
    return NextResponse.json({ snapshots })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/wallet/snapshots error')
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => ({}))) as { label?: string }
    const label = typeof body.label === 'string' ? body.label.trim() || null : null

    const snapshot = await db.walletSnapshot.create({
      data: {
        userId: user.id,
        label,
        status: 'pending',
      },
      select: { id: true, label: true, status: true, createdAt: true },
    })

    logger.info({ userId: user.id, snapshotId: snapshot.id }, 'POST /api/routes-d/wallet/snapshots created')
    return NextResponse.json({ snapshot }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/wallet/snapshots error')
    return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 })
  }
}
