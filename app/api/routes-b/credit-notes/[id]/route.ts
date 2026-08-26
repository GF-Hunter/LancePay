import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/credit-notes/[id] — fetch a single credit note owned by the
// authenticated user.

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

    const creditNote = await prisma.creditNote.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        invoiceId: true,
        creditNumber: true,
        amount: true,
        currency: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    })

    if (!creditNote) {
      return NextResponse.json({ error: 'Credit note not found' }, { status: 404 })
    }
    if (creditNote.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      creditNote: {
        id: creditNote.id,
        invoiceId: creditNote.invoiceId,
        creditNumber: creditNote.creditNumber,
        amount: Number(creditNote.amount),
        currency: creditNote.currency,
        reason: creditNote.reason,
        status: creditNote.status,
        createdAt: creditNote.createdAt.toISOString(),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/credit-notes/[id] error')
    return NextResponse.json({ error: 'Failed to fetch credit note' }, { status: 500 })
  }
}
