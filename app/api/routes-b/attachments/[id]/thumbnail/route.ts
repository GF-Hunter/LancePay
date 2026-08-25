import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/attachments/[id]/thumbnail — fetch an attachment thumbnail

type AttachmentDelegate = {
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

function getAttachmentDelegate(): AttachmentDelegate {
  return (prisma as unknown as { attachment: AttachmentDelegate }).attachment
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

    const delegate = getAttachmentDelegate()
    const attachment = await delegate.findFirst({
      where: { id, userId },
      select: { id: true, thumbnailUrl: true, mimeType: true },
    })
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    if (!attachment.thumbnailUrl) {
      return NextResponse.json({ error: 'Thumbnail not available for this attachment' }, { status: 404 })
    }

    return NextResponse.json({
      attachmentId: attachment.id,
      thumbnailUrl: attachment.thumbnailUrl,
      mimeType: attachment.mimeType ?? null,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/attachments/[id]/thumbnail error')
    return NextResponse.json({ error: 'Failed to fetch attachment thumbnail' }, { status: 500 })
  }
}
