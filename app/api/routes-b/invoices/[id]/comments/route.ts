import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/invoices/[id]/comments — list comments on an invoice.
// POST /api/routes-b/invoices/[id]/comments — post a new comment on an invoice.
//
// Both are scoped to invoices owned by the authenticated user. Comments are
// stored on the shared InvoiceMessage model with isInternal=false, which
// distinguishes them from the internal team @mentions exposed at
// /api/routes-b/invoices/[id]/mentions (isInternal=true).
//
// GET query params (all optional):
//   page  — 1-based page number (default: 1)
//   limit — page size 1–100 (default: 25)

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_CONTENT_LENGTH = 5000

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId } })
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

    const where = { invoiceId, isInternal: false }

    const [comments, total] = await Promise.all([
      prisma.invoiceMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          senderId: true,
          senderType: true,
          senderName: true,
          content: true,
          attachmentUrl: true,
          createdAt: true,
        },
      }),
      prisma.invoiceMessage.count({ where }),
    ])

    return NextResponse.json({
      comments: comments.map((comment) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/invoices/[id]/comments error')
    return NextResponse.json({ error: 'Failed to fetch invoice comments' }, { status: 500 })
  }
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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const { content, attachmentUrl } = payload

    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Content is required and must be a non-empty string' },
        { status: 400 },
      )
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters` },
        { status: 400 },
      )
    }

    if (attachmentUrl !== undefined && attachmentUrl !== null && typeof attachmentUrl !== 'string') {
      return NextResponse.json({ error: 'attachmentUrl must be a string' }, { status: 400 })
    }

    const comment = await prisma.invoiceMessage.create({
      data: {
        invoiceId,
        senderId: user.id,
        senderType: 'freelancer',
        senderName: user.name || user.email || 'Unknown',
        content: content.trim(),
        attachmentUrl: (attachmentUrl as string | undefined) || null,
        isInternal: false,
      },
      select: {
        id: true,
        senderId: true,
        senderType: true,
        senderName: true,
        content: true,
        attachmentUrl: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      {
        comment: {
          ...comment,
          createdAt: comment.createdAt.toISOString(),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/comments error')
    return NextResponse.json({ error: 'Failed to create invoice comment' }, { status: 500 })
  }
}
