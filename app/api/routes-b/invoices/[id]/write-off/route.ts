import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { extractRequestMetadata, logAuditEvent } from '@/lib/audit'
import { logger } from '@/lib/logger'

const WRITTEN_OFF_STATUS = 'bad_debt'
const WRITE_OFF_BLOCKED_STATUSES = new Set(['paid', 'cancelled'])
const MAX_REASON_LENGTH = 500

interface WriteOffRequestBody {
  reason?: unknown
}

function normalizeReason(reason: unknown): string | null {
  if (reason === undefined || reason === null) return null
  if (typeof reason !== 'string') throw new Error('Reason must be a string')

  const trimmed = reason.trim()
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new Error(`Reason must be ${MAX_REASON_LENGTH} characters or fewer`)
  }

  return trimmed || null
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

    let body: WriteOffRequestBody = {}
    try {
      body = (await request.json()) as WriteOffRequestBody
    } catch {
      body = {}
    }

    let reason: string | null
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

    if (WRITE_OFF_BLOCKED_STATUSES.has(invoice.status)) {
      return NextResponse.json(
        { error: `Invoice with status ${invoice.status} cannot be written off` },
        { status: 422 },
      )
    }

    if (invoice.status === WRITTEN_OFF_STATUS) {
      return NextResponse.json({ invoice })
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: { status: WRITTEN_OFF_STATUS },
      select: {
        id: true,
        status: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        updatedAt: true,
      },
    })

    await logAuditEvent(id, 'invoice.write_off', user.id, {
      ...extractRequestMetadata(request.headers),
      previousStatus: invoice.status,
      nextStatus: WRITTEN_OFF_STATUS,
      reason,
    })

    return NextResponse.json({ invoice: updatedInvoice })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/write-off error')
    return NextResponse.json({ error: 'Failed to write off invoice' }, { status: 500 })
  }
}
