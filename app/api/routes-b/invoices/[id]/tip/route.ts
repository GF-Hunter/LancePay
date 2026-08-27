import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logAuditEvent, extractRequestMetadata } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function POST(
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
    if (invoice.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending invoices can receive a tip' }, { status: 422 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const amount = typeof body === 'object' && body !== null && 'amount' in body
      ? Number((body as { amount: unknown }).amount)
      : NaN
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { amount: { increment: amount } },
    })
    await logAuditEvent(id, 'invoice.tip_added', user.id, extractRequestMetadata(request.headers), prisma)
    return NextResponse.json({ tip: { amount, currency: invoice.currency }, invoice: {
      id: updated.id,
      amount: Number(updated.amount),
      currency: updated.currency,
    } }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'Add invoice tip error')
    return NextResponse.json({ error: 'Failed to add invoice tip' }, { status: 500 })
  }
}