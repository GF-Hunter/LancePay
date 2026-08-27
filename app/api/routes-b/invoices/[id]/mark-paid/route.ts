import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logAuditEvent, extractRequestMetadata } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const claims = await verifyAuthToken(token)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id } })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (invoice.status === 'paid') return NextResponse.json({ error: 'Invoice is already paid' }, { status: 409 })
    if (invoice.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending invoices can be marked as paid' }, { status: 422 })
    }

    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      const update = await tx.invoice.updateMany({
        where: { id, userId: user.id, status: 'pending' },
        data: { status: 'paid', paidAt: now },
      })
      if (update.count === 0) return null
      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'incoming',
          status: 'completed',
          amount: invoice.amount,
          currency: invoice.currency,
          invoiceId: id,
          completedAt: now,
        },
      })
      await logAuditEvent(id, 'invoice.paid', user.id, extractRequestMetadata(request.headers), tx)
      return transaction
    })
    if (!result) return NextResponse.json({ error: 'Invoice could not be marked as paid' }, { status: 409 })

    return NextResponse.json({
      invoice: { id, status: 'paid', paidAt: now.toISOString() },
      transaction: { ...result, amount: Number(result.amount), completedAt: result.completedAt?.toISOString() ?? null },
    })
  } catch (error) {
    logger.error({ err: error }, 'Mark invoice paid error')
    return NextResponse.json({ error: 'Failed to mark invoice as paid' }, { status: 500 })
  }
}