import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/invoices/[id]/audit-trail — per-invoice audit trail

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

function parsePage(raw: string | null): number {
  if (!raw) return 1
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolvedParams = await params
    const { id } = resolvedParams

    if (!id || typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        OR: [{ userId: user.id }, { clientId: user.id }],
      },
      select: { id: true, userId: true, clientId: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const url = new URL(request.url)
    const eventType = url.searchParams.get('eventType')
    const page = parsePage(url.searchParams.get('page'))
    const limit = parseLimit(url.searchParams.get('limit'))

    const where: Record<string, unknown> = { invoiceId: id }
    if (eventType) {
      where.eventType = eventType
    }

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          invoiceId: true,
          eventType: true,
          actorId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.auditEvent.count({ where }),
    ])

    return NextResponse.json({
      auditTrail: events,
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/invoices/[id]/audit-trail error')
    return NextResponse.json({ error: 'Failed to fetch invoice audit trail' }, { status: 500 })
  }
}
