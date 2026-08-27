import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { generateToken, hashToken } from '@/lib/crypto'
import { extractRequestMetadata, logAuditEvent } from '@/lib/audit'
import { logger } from '@/lib/logger'

// POST /api/routes-b/invoices/[id]/public-link — generate a public,
// token-based shareable link for an invoice.
//
// Scoped to invoices owned by the authenticated user. Only the SHA-256 hash
// of the token is persisted (see lib/crypto.ts, same approach as ApiKey);
// the plaintext token is returned exactly once, in the response body, and
// is never stored or logged. Calling this again while an active link
// exists revokes the previous link and issues a new one, so at most one
// active public link exists per invoice at a time.
//
// Optional JSON body:
//   expiresInSeconds — positive integer; when provided, the link expires
//                      that many seconds from now. Omit for no expiry.

const MAX_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 365 // 1 year

interface PublicLinkRequestBody {
  expiresInSeconds?: unknown
}

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

function parseExpiresInSeconds(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw new Error('expiresInSeconds must be a positive number')
  }
  if (raw > MAX_EXPIRES_IN_SECONDS) {
    throw new Error(`expiresInSeconds must be ${MAX_EXPIRES_IN_SECONDS} or fewer`)
  }
  return Math.floor(raw)
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

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: user.id },
      select: { id: true },
    })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    let body: PublicLinkRequestBody = {}
    try {
      body = (await request.json()) as PublicLinkRequestBody
    } catch {
      body = {}
    }

    let expiresInSeconds: number | null
    try {
      expiresInSeconds = parseExpiresInSeconds(body.expiresInSeconds)
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }

    const token = generateToken()
    const hashedToken = hashToken(token)
    const tokenHint = token.slice(-8)
    const expiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null

    const [, link] = await prisma.$transaction([
      prisma.invoicePublicLink.updateMany({
        where: { invoiceId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.invoicePublicLink.create({
        data: {
          invoiceId,
          hashedToken,
          tokenHint,
          createdBy: user.id,
          expiresAt,
        },
        select: {
          id: true,
          tokenHint: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ])

    await logAuditEvent(invoiceId, 'invoice.public_link_generated', user.id, {
      ...extractRequestMetadata(request.headers),
      publicLinkId: link.id,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    })

    return NextResponse.json(
      {
        publicLink: {
          id: link.id,
          token,
          tokenHint: link.tokenHint,
          expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
          createdAt: link.createdAt.toISOString(),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/public-link error')
    return NextResponse.json({ error: 'Failed to generate invoice public link' }, { status: 500 })
  }
}
