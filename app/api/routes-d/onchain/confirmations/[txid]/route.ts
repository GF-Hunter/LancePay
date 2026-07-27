import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const REQUIRED_CONFIRMATIONS = 12
const MS_PER_CONFIRMATION = 60_000

type RouteContext = {
  params: Promise<{ txid: string }> | { txid: string }
}

async function resolveParams(context: RouteContext): Promise<{ txid: string }> {
  const raw = context.params as { txid: string } | Promise<{ txid: string }>
  if (raw && typeof (raw as Promise<{ txid: string }>).then === 'function') {
    return raw as Promise<{ txid: string }>
  }
  return raw as { txid: string }
}

function computeConfirmations(status: string, createdAt: Date): { confirmations: number; confirmed: boolean } {
  if (status === 'completed') {
    return { confirmations: REQUIRED_CONFIRMATIONS, confirmed: true }
  }
  if (status === 'failed') {
    return { confirmations: 0, confirmed: false }
  }
  const elapsedMs = Date.now() - createdAt.getTime()
  const confirmations = Math.max(0, Math.min(REQUIRED_CONFIRMATIONS - 1, Math.floor(elapsedMs / MS_PER_CONFIRMATION)))
  return { confirmations, confirmed: false }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { txid } = await resolveParams(context)
    if (!txid) return NextResponse.json({ error: 'txid is required' }, { status: 400 })

    const transaction = await prisma.transaction.findFirst({ where: { txHash: txid } })
    if (!transaction) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    if (transaction.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { confirmations, confirmed } = computeConfirmations(transaction.status, transaction.createdAt)

    return NextResponse.json({
      confirmation: {
        txid,
        status: transaction.status,
        confirmations,
        requiredConfirmations: REQUIRED_CONFIRMATIONS,
        confirmed,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'onchain confirmations error')
    return NextResponse.json({ error: 'Failed to fetch confirmation count' }, { status: 500 })
  }
}
