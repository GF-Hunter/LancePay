import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/audit-log — list audit-log entries scoped to the
// authenticated user's own invoices.
//
// Query params (all optional):
//   invoiceId — restrict to a single invoice (must belong to the user)
//   eventType — exact eventType string filter
//   page      — 1-based page number (default: 1)
//   limit     — page size 1–100 (default: 25)

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
}

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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    const invoiceIdParam = searchParams.get('invoiceId')
    if (invoiceIdParam) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceIdParam, userId: user.id },
        select: { id: true },
      })
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }
    }

    const eventTypeParam = searchParams.get('eventType')
    const page = parsePage(searchParams.get('page'))
    const limit = parseLimit(searchParams.get('limit'))

    const where: Record<string, unknown> = {
      invoice: { userId: user.id },
    }
    if (invoiceIdParam) where.invoiceId = invoiceIdParam
    if (eventTypeParam) where.eventType = eventTypeParam

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
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/audit-log error')
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
