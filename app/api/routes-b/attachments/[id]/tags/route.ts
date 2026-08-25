import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET,POST /api/routes-b/attachments/[id]/tags — list and add attachment tags

const MAX_TAGS_PER_REQUEST = 20

type AttachmentDelegate = {
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

type AttachmentTagDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>
  createMany: (args: Record<string, unknown>) => Promise<{ count: number }>
}

function getAttachmentDelegate(): AttachmentDelegate {
  return (prisma as unknown as { attachment: AttachmentDelegate }).attachment
}

function getAttachmentTagDelegate(): AttachmentTagDelegate {
  return (prisma as unknown as { attachmentTag: AttachmentTagDelegate }).attachmentTag
}

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
  return user ? user.id : null
}

async function findOwnedAttachment(attachmentId: string, userId: string) {
  const delegate = getAttachmentDelegate()
  return delegate.findFirst({ where: { id: attachmentId, userId }, select: { id: true } })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id || !id.trim()) {
      return NextResponse.json({ error: 'Attachment id is required' }, { status: 400 })
    }

    const userId = await getAuthenticatedUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const attachment = await findOwnedAttachment(id, userId)
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    const tagDelegate = getAttachmentTagDelegate()
    const tags = await tagDelegate.findMany({
      where: { attachmentId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, createdAt: true },
    })

    return NextResponse.json({ tags })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/attachments/[id]/tags error')
    return NextResponse.json({ error: 'Failed to list attachment tags' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id || !id.trim()) {
      return NextResponse.json({ error: 'Attachment id is required' }, { status: 400 })
    }

    const userId = await getAuthenticatedUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const attachment = await findOwnedAttachment(id, userId)
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const rawTags = Array.isArray(payload.tags) ? payload.tags : [payload.tag]
    const tagNames = [
      ...new Set(
        rawTags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ]

    if (tagNames.length === 0) {
      return NextResponse.json({ error: 'At least one tag name is required' }, { status: 400 })
    }

    if (tagNames.length > MAX_TAGS_PER_REQUEST) {
      return NextResponse.json(
        { error: `At most ${MAX_TAGS_PER_REQUEST} tags are allowed per request` },
        { status: 400 },
      )
    }

    const tagDelegate = getAttachmentTagDelegate()
    const result = await tagDelegate.createMany({
      data: tagNames.map((name) => ({ attachmentId: id, name })),
      skipDuplicates: true,
    })

    logger.info({ userId, attachmentId: id, tagsAdded: result.count }, 'POST /api/routes-b/attachments/[id]/tags')

    return NextResponse.json(
      { attachmentId: id, tagsAdded: result.count, tags: tagNames },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/attachments/[id]/tags error')
    return NextResponse.json({ error: 'Failed to add attachment tags' }, { status: 500 })
  }
}
