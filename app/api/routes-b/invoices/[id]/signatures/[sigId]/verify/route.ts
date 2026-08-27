import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { verifySignature } from '@/lib/audit'
import { logger } from '@/lib/logger'

// POST /api/routes-b/invoices/[id]/signatures/[sigId]/verify — verify an invoice signature

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sigId: string }> },
) {
  try {
    const { id: invoiceId, sigId } = await params
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: user.id },
      select: { id: true },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const auditEvent = await prisma.auditEvent.findFirst({
      where: { id: sigId, invoiceId },
      select: {
        id: true,
        eventType: true,
        metadata: true,
        signature: true,
        createdAt: true,
      },
    })
    if (!auditEvent) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 })
    }

    const metadata =
      auditEvent.metadata && typeof auditEvent.metadata === 'object' && !Array.isArray(auditEvent.metadata)
        ? (auditEvent.metadata as Record<string, unknown>)
        : null

    const valid = verifySignature(
      invoiceId,
      auditEvent.eventType,
      auditEvent.createdAt.toISOString(),
      metadata,
      auditEvent.signature,
    )

    return NextResponse.json({
      valid,
      signatureId: auditEvent.id,
      eventType: auditEvent.eventType,
    })
  } catch (error) {
    logger.error(
      { err: error },
      'POST /api/routes-b/invoices/[id]/signatures/[sigId]/verify error',
    )
    return NextResponse.json({ error: 'Failed to verify invoice signature' }, { status: 500 })
  }
}
