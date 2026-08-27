import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { extractRequestMetadata, logAuditEvent } from '@/lib/audit'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/invoices/[id]/refunds — list refunds issued against an invoice.
// POST /api/routes-b/invoices/[id]/refunds — issue a new refund against an invoice.

const REFUND_BLOCKED_STATUSES = new Set(['pending', 'cancelled'])

function serializeRefund(refund: {
  id: string
  invoiceId: string
  amount: { toString(): string }
  currency: string
  reason: string
  status: string
  createdAt: Date
}) {
  return {
    id: refund.id,
    invoiceId: refund.invoiceId,
    amount: Number(refund.amount),
    currency: refund.currency,
    reason: refund.reason,
    status: refund.status,
    createdAt: refund.createdAt.toISOString(),
  }
}

async function authenticate(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const claims = await verifyAuthToken(authToken)
  if (!claims) return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }

  const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) }

  return { user }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params
    const auth = await authenticate(request)
    if (auth.error) return auth.error
    const user = auth.user!

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, userId: true },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (invoice.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const refunds = await prisma.refund.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        currency: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ refunds: refunds.map(serializeRefund) })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/invoices/[id]/refunds error')
    return NextResponse.json({ error: 'Failed to fetch refunds' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params
    const auth = await authenticate(request)
    if (auth.error) return auth.error
    const user = auth.user!

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const { amount, reason } = payload

    if (typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, userId: true, status: true, amount: true, currency: true },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (invoice.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (REFUND_BLOCKED_STATUSES.has(invoice.status)) {
      return NextResponse.json(
        { error: `Invoice with status ${invoice.status} cannot be refunded` },
        { status: 422 },
      )
    }

    if (parsedAmount > Number(invoice.amount)) {
      return NextResponse.json(
        { error: 'amount cannot exceed the invoice total' },
        { status: 400 },
      )
    }

    const refund = await prisma.refund.create({
      data: {
        userId: user.id,
        invoiceId: invoice.id,
        amount: parsedAmount,
        currency: invoice.currency,
        reason: reason.trim(),
        status: 'pending',
      },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        currency: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    })

    await logAuditEvent(invoice.id, 'invoice.refund_issued', user.id, {
      ...extractRequestMetadata(request.headers),
      refundId: refund.id,
      amount: parsedAmount,
      reason: refund.reason,
    })

    return NextResponse.json({ refund: serializeRefund(refund) }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/refunds error')
    return NextResponse.json({ error: 'Failed to issue refund' }, { status: 500 })
  }
}
