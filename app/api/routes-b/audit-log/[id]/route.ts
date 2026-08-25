import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/audit-log/[id] — fetch a single audit-log entry.
// Scoped to entries belonging to one of the authenticated user's own invoices.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id || !id.trim()) {
      return NextResponse.json({ error: 'Audit log id is required' }, { status: 400 })
    }

    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const event = await prisma.auditEvent.findFirst({
      where: { id, invoice: { userId: user.id } },
      select: {
        id: true,
        invoiceId: true,
        eventType: true,
        actorId: true,
        metadata: true,
        createdAt: true,
      },
    })

    if (!event) {
      return NextResponse.json({ error: 'Audit log entry not found' }, { status: 404 })
    }

    return NextResponse.json({ event })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/audit-log/[id] error')
    return NextResponse.json({ error: 'Failed to fetch audit log entry' }, { status: 500 })
  }
}
