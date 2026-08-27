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

    const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id } })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const deliveries = await prisma.paymentReminder.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reminderType: true, sentAt: true, createdAt: true },
    })
    return NextResponse.json({ deliveries })
  } catch (error) {
    logger.error({ err: error }, 'Get invoice deliveries error')
    return NextResponse.json({ error: 'Failed to get invoice deliveries' }, { status: 500 })
  }
}