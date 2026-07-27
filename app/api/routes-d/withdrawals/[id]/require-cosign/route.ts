import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── POST /api/routes-d/withdrawals/[id]/require-cosign — require a co-signer ──
//
// Flags a withdrawal as requiring approval from a second user (co-signer)
// before it can proceed to the anchor. Only the withdrawal owner may set
// this flag, and only while the withdrawal is still in a state where the
// on-chain flow has not yet started (pending or interactive).
//
// Body:
//   cosignerId  (required) — UUID of the user who must co-sign
//   note        (optional) — free-text reason sent to the co-signer (≤500 chars)

const COSIGNABLE_STATUSES = ['pending', 'interactive'] as const
const MAX_NOTE_LENGTH = 500

type WithdrawalDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function getWithdrawalDelegate(): WithdrawalDelegate {
  return (prisma as unknown as { withdrawalTransaction: WithdrawalDelegate }).withdrawalTransaction
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // ── Body validation ───────────────────────────────────────────────────
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { cosignerId, note } = body

    if (!cosignerId || typeof cosignerId !== 'string' || !cosignerId.trim()) {
      return NextResponse.json({ error: 'cosignerId is required' }, { status: 400 })
    }
    const trimmedCosignerId = cosignerId.trim()

    if (trimmedCosignerId === user.id) {
      return NextResponse.json(
        { error: 'cosignerId must be a different user; you cannot co-sign your own withdrawal' },
        { status: 400 },
      )
    }

    let trimmedNote: string | null = null
    if (note !== undefined && note !== null) {
      if (typeof note !== 'string') {
        return NextResponse.json({ error: 'note must be a string' }, { status: 400 })
      }
      const n = note.trim()
      if (n.length > MAX_NOTE_LENGTH) {
        return NextResponse.json(
          { error: `note must be at most ${MAX_NOTE_LENGTH} characters` },
          { status: 400 },
        )
      }
      trimmedNote = n || null
    }

    // ── Verify co-signer exists ───────────────────────────────────────────
    const cosigner = await prisma.user.findUnique({
      where: { id: trimmedCosignerId },
      select: { id: true },
    })
    if (!cosigner) {
      return NextResponse.json({ error: 'Co-signer not found' }, { status: 404 })
    }

    // ── Load & guard the withdrawal ───────────────────────────────────────
    const delegate = getWithdrawalDelegate()

    const withdrawal = await delegate.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, cosignerId: true },
    })

    if (!withdrawal) {
      return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
    }

    if ((withdrawal as { userId: string }).userId !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to modify this withdrawal' },
        { status: 403 },
      )
    }

    if (!COSIGNABLE_STATUSES.includes((withdrawal as { status: string }).status as typeof COSIGNABLE_STATUSES[number])) {
      return NextResponse.json(
        {
          error: `Co-sign cannot be required for a withdrawal in status '${(withdrawal as { status: string }).status}'`,
          status: (withdrawal as { status: string }).status,
        },
        { status: 409 },
      )
    }

    if ((withdrawal as { cosignerId?: string | null }).cosignerId) {
      return NextResponse.json(
        { error: 'A co-signer has already been set for this withdrawal' },
        { status: 409 },
      )
    }

    // ── Persist the co-sign requirement ───────────────────────────────────
    const updated = await delegate.update({
      where: { id },
      data: {
        cosignerId: trimmedCosignerId,
        ...(trimmedNote !== null ? { cosignNote: trimmedNote } : {}),
      },
      select: {
        id: true,
        userId: true,
        cosignerId: true,
        status: true,
        amount: true,
        asset: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(
      {
        withdrawal: {
          id: updated.id,
          status: updated.status,
          cosignerId: updated.cosignerId,
          amount: Number(updated.amount),
          asset: updated.asset,
          updatedAt: updated.updatedAt,
        },
        message: 'Co-signer requirement has been set. The withdrawal will proceed once approved.',
      },
      { status: 200 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/withdrawals/[id]/require-cosign error')
    return NextResponse.json({ error: 'Failed to set co-signer requirement' }, { status: 500 })
  }
}
