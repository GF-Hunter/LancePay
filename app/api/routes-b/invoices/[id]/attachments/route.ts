import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/invoices/[id]/attachments — list attachments on an invoice.
// POST /api/routes-b/invoices/[id]/attachments — register a new attachment on an invoice.
//
// Both are scoped to invoices owned by the authenticated user.
//
// GET query params (all optional):
//   page  — 1-based page number (default: 1)
//   limit — page size 1–100 (default: 25)

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_SIZE_BYTES = 25 * 1024 * 1024 // 25MB

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
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

    const [attachments, total] = await Promise.all([
      prisma.invoiceAttachment.findMany({
        where: { invoiceId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          mimeType: true,
          sizeBytes: true,
          uploadedBy: true,
          createdAt: true,
        },
      }),
      prisma.invoiceAttachment.count({ where: { invoiceId } }),
    ])

    return NextResponse.json({
      attachments: attachments.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/invoices/[id]/attachments error')
    return NextResponse.json({ error: 'Failed to fetch invoice attachments' }, { status: 500 })
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
    const { fileName, fileUrl, mimeType, sizeBytes } = payload

    if (typeof fileName !== 'string' || !fileName.trim()) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
    }

    if (typeof fileUrl !== 'string' || !isValidUrl(fileUrl)) {
      return NextResponse.json({ error: 'fileUrl must be a valid URL' }, { status: 400 })
    }

    if (typeof mimeType !== 'string' || !mimeType.trim()) {
      return NextResponse.json({ error: 'mimeType is required' }, { status: 400 })
    }

    if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return NextResponse.json({ error: 'sizeBytes must be a positive number' }, { status: 400 })
    }

    if (sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `sizeBytes exceeds the maximum allowed size of ${MAX_SIZE_BYTES} bytes` },
        { status: 400 },
      )
    }

    const attachment = await prisma.invoiceAttachment.create({
      data: {
        invoiceId,
        uploadedBy: user.id,
        fileName: fileName.trim(),
        fileUrl,
        mimeType: mimeType.trim(),
        sizeBytes: Math.floor(sizeBytes),
      },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        uploadedBy: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      {
        attachment: {
          ...attachment,
          createdAt: attachment.createdAt.toISOString(),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/attachments error')
    return NextResponse.json({ error: 'Failed to upload invoice attachment' }, { status: 500 })
  }
}
