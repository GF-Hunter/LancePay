import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// DELETE /api/routes-b/attachments/library/[id] — remove a library attachment

type LibraryAttachmentDelegate = {
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  delete: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function getLibraryAttachmentDelegate(): LibraryAttachmentDelegate {
  return (prisma as unknown as { attachmentLibraryItem: LibraryAttachmentDelegate })
    .attachmentLibraryItem
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

export async function DELETE(
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

    const delegate = getLibraryAttachmentDelegate()
    const attachment = await delegate.findFirst({
      where: { id, userId },
    })
    if (!attachment) {
      return NextResponse.json({ error: 'Library attachment not found' }, { status: 404 })
    }

    await delegate.delete({ where: { id } })

    logger.info({ userId, attachmentId: id }, 'DELETE /api/routes-b/attachments/library/[id]')
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    logger.error({ err: error }, 'DELETE /api/routes-b/attachments/library/[id] error')
    return NextResponse.json({ error: 'Failed to delete library attachment' }, { status: 500 })
  }
}
