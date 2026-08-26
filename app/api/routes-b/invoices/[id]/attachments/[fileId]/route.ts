import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// DELETE /api/routes-b/invoices/[id]/attachments/[fileId] — remove an invoice attachment.
//
// Scoped to invoices owned by the authenticated user.

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

async function findOwnedInvoice(invoiceId: string, userId: string) {
  return prisma.invoice.findFirst({ where: { id: invoiceId, userId }, select: { id: true } })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const { id: invoiceId, fileId } = await params
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!invoiceId || !invoiceId.trim()) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    if (!fileId || !fileId.trim()) {
      return NextResponse.json({ error: 'Attachment ID is required' }, { status: 400 })
    }

    const invoice = await findOwnedInvoice(invoiceId, user.id)
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const attachment = await prisma.invoiceAttachment.findFirst({
      where: { id: fileId, invoiceId },
      select: { id: true },
    })
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    await prisma.invoiceAttachment.delete({ where: { id: fileId } })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    logger.error(
      { err: error },
      'DELETE /api/routes-b/invoices/[id]/attachments/[fileId] error',
    )
    return NextResponse.json({ error: 'Failed to remove invoice attachment' }, { status: 500 })
  }
}
