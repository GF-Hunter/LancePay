import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET /api/routes-d/audit-log/export — long-form audit log export ──
//
// Exports AuditEvent rows scoped to the authenticated user's own invoices.
// Supports filtering by date range, eventType, and invoiceId.
// Paginated to avoid unbounded response sizes.
//
// Query params (all optional):
//   from        — ISO 8601 date; lower bound on createdAt (inclusive)
//   to          — ISO 8601 date; upper bound on createdAt (inclusive)
//   eventType   — exact eventType string filter
//   invoiceId   — restrict to a single invoice (must belong to the user)
//   page        — 1-based page number (default: 1)
//   limit       — page size 1–500 (default: 100)

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

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

function parseDate(raw: string | null): Date | null | undefined {
  // null  → param absent
  // undefined → param present but invalid
  if (raw === null) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return undefined
  return d
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

    // ── Date range validation ─────────────────────────────────────────────
    const fromDate = parseDate(searchParams.get('from'))
    const toDate = parseDate(searchParams.get('to'))

    if (fromDate === undefined) {
      return NextResponse.json(
        { error: 'from must be a valid ISO 8601 date' },
        { status: 400 },
      )
    }
    if (toDate === undefined) {
      return NextResponse.json(
        { error: 'to must be a valid ISO 8601 date' },
        { status: 400 },
      )
    }
    if (fromDate && toDate && fromDate > toDate) {
      return NextResponse.json(
        { error: 'from must not be later than to' },
        { status: 400 },
      )
    }

    // ── Optional invoiceId ownership check ────────────────────────────────
    const invoiceIdParam = searchParams.get('invoiceId')
    if (invoiceIdParam) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceIdParam, userId: user.id },
        select: { id: true },
      })
      if (!invoice) {
        return NextResponse.json(
          { error: 'Invoice not found' },
          { status: 404 },
        )
      }
    }

    const eventTypeParam = searchParams.get('eventType')
    const page = parsePage(searchParams.get('page'))
    const limit = parseLimit(searchParams.get('limit'))

    // ── Build where clause ────────────────────────────────────────────────
    // Scope to the authenticated user's invoices via the relation.
    const where: Record<string, unknown> = {
      invoice: { userId: user.id },
    }

    if (invoiceIdParam) {
      where.invoiceId = invoiceIdParam
    }

    if (eventTypeParam) {
      where.eventType = eventTypeParam
    }

    const createdAt: Record<string, Date> = {}
    if (fromDate) createdAt.gte = fromDate
    if (toDate) {
      // Treat to as end-of-day inclusive by setting to the start of the next ms boundary
      const toInclusive = new Date(toDate)
      toInclusive.setUTCHours(23, 59, 59, 999)
      createdAt.lte = toInclusive
    }
    if (Object.keys(createdAt).length > 0) {
      where.createdAt = createdAt
    }

    // ── Query ─────────────────────────────────────────────────────────────
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
          signature: true,
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
    logger.error({ err: error }, 'GET /api/routes-d/audit-log/export error')
    return NextResponse.json({ error: 'Failed to export audit log' }, { status: 500 })
  }
}
