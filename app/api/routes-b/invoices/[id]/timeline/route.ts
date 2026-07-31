import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/invoices/[id]/timeline — invoice timeline events

export async function GET(
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

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        OR: [{ userId: user.id }, { clientId: user.id }],
      },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const events = await prisma.auditEvent.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        eventType: true,
        actorId: true,
        metadata: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ events })
  } catch (error) {
    logger.error({ err: error }, 'Get invoice timeline error')
    return NextResponse.json({ error: 'Failed to get invoice timeline' }, { status: 500 })
  }
}
