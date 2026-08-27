import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { extractRequestMetadata, logAuditEvent } from '@/lib/audit'
import { logger } from '@/lib/logger'

// POST /api/routes-b/invoices/[id]/void — void an invoice with a reason

const VOIDED_STATUS = 'voided'
const VOID_BLOCKED_STATUSES = new Set(['paid', 'cancelled', 'bad_debt'])
const MAX_REASON_LENGTH = 500

interface VoidRequestBody {
  reason?: unknown
}

function normalizeReason(reason: unknown): string {
  if (typeof reason !== 'string') throw new Error('Reason is required and must be a string')

  const trimmed = reason.trim()
  if (!trimmed) throw new Error('Reason is required')
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new Error(`Reason must be ${MAX_REASON_LENGTH} characters or fewer`)
  }

  return trimmed
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    let body: VoidRequestBody
    try {
      body = (await request.json()) as VoidRequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    let reason: string
    try {
      reason = normalizeReason(body.reason)
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
      },
    })

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (invoice.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (VOID_BLOCKED_STATUSES.has(invoice.status)) {
      return NextResponse.json(
        { error: `Invoice with status ${invoice.status} cannot be voided` },
        { status: 422 },
      )
    }

    if (invoice.status === VOIDED_STATUS) {
      return NextResponse.json({ invoice })
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: VOIDED_STATUS,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
      select: {
        id: true,
        status: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        cancelledAt: true,
        cancellationReason: true,
        updatedAt: true,
      },
    })

    await logAuditEvent(id, 'invoice.voided', user.id, {
      ...extractRequestMetadata(request.headers),
      previousStatus: invoice.status,
      nextStatus: VOIDED_STATUS,
      reason,
    })

    return NextResponse.json({
      invoice: {
        ...updatedInvoice,
        amount: Number(updatedInvoice.amount),
        cancelledAt: updatedInvoice.cancelledAt?.toISOString() ?? null,
        updatedAt: updatedInvoice.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/void error')
    return NextResponse.json({ error: 'Failed to void invoice' }, { status: 500 })
  }
}
