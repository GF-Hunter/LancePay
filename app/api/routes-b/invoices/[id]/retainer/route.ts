import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(
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

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: user.id },
      include: { subscription: true },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (!invoice.subscription) {
      return NextResponse.json({ error: 'Invoice is not linked to a retainer' }, { status: 404 })
    }

    const subscription = invoice.subscription
    return NextResponse.json({
      retainer: {
        id: subscription.id,
        invoiceId: invoice.id,
        description: subscription.description,
        amount: Number(subscription.amount),
        currency: subscription.currency,
        frequency: subscription.frequency,
        interval: subscription.interval,
        status: subscription.status,
        nextGenerationDate: subscription.nextGenerationDate.toISOString(),
        lastGeneratedAt: subscription.lastGeneratedAt?.toISOString() ?? null,
        invoiceStatus: invoice.status,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Get invoice retainer error')
    return NextResponse.json({ error: 'Failed to get invoice retainer' }, { status: 500 })
  }
}