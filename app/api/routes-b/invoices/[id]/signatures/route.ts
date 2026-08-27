import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { extractRequestMetadata, logAuditEvent } from '@/lib/audit'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/invoices/[id]/signatures — list invoice signature audit events
// POST /api/routes-b/invoices/[id]/signatures — request an invoice signature audit event
//
// GET query params (all optional):
//   page  — 1-based page number (default: 1)
//   limit — page size 1–100 (default: 25)

const SIGNATURE_EVENT_PREFIX = 'invoice.signature'
const SIGNATURE_REQUESTED = 'invoice.signature.requested'
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_NOTE_LENGTH = 500

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
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

async function findOwnedInvoice(invoiceId: string, userId: string) {
  return prisma.invoice.findFirst({ where: { id: invoiceId, userId }, select: { id: true } })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!invoiceId || !invoiceId.trim()) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    const invoice = await findOwnedInvoice(invoiceId, user.id)
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const page = parsePage(searchParams.get('page'))
    const limit = parseLimit(searchParams.get('limit'))

    const where = {
      invoiceId,
      eventType: { startsWith: SIGNATURE_EVENT_PREFIX },
    }

    const [signatures, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
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
      signatures: signatures.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/invoices/[id]/signatures error')
    return NextResponse.json({ error: 'Failed to fetch invoice signatures' }, { status: 500 })
  }
}

interface SignatureRequestBody {
  note?: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!invoiceId || !invoiceId.trim()) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    const invoice = await findOwnedInvoice(invoiceId, user.id)
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    let body: SignatureRequestBody = {}
    try {
      body = (await request.json()) as SignatureRequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    let note: string | null = null
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== 'string') {
        return NextResponse.json({ error: 'note must be a string' }, { status: 400 })
      }
      const trimmed = body.note.trim()
      if (trimmed.length > MAX_NOTE_LENGTH) {
        return NextResponse.json(
          { error: `note must be ${MAX_NOTE_LENGTH} characters or fewer` },
          { status: 400 },
        )
      }
      note = trimmed || null
    }

    const auditEvent = await logAuditEvent(invoiceId, SIGNATURE_REQUESTED, user.id, {
      ...extractRequestMetadata(request.headers),
      ...(note ? { note } : {}),
    })

    return NextResponse.json(
      {
        signature: {
          id: auditEvent.id,
          eventType: auditEvent.eventType,
          actorId: auditEvent.actorId,
          metadata: auditEvent.metadata,
          signature: auditEvent.signature,
          createdAt: auditEvent.createdAt.toISOString(),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/signatures error')
    return NextResponse.json({ error: 'Failed to request invoice signature' }, { status: 500 })
  }
}
