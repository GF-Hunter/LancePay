import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: { invoice: true },
    })

    if (!dispute) {
      return NextResponse.json({ error: 'Chargeback not found' }, { status: 404 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: dispute.invoiceId, userId: user.id },
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Unauthorized to upload evidence for this chargeback' },
        { status: 403 },
      )
    }

    const { documentUrl, description, documentType } = await request.json()

    if (!documentUrl || typeof documentUrl !== 'string' || documentUrl.trim().length === 0) {
      return NextResponse.json(
        { error: 'Document URL is required and must be a non-empty string' },
        { status: 400 },
      )
    }

    if (documentType && !['receipt', 'invoice', 'communication', 'proof', 'other'].includes(documentType)) {
      return NextResponse.json(
        { error: 'Invalid document type' },
        { status: 400 },
      )
    }

    if (description && description.length > 1000) {
      return NextResponse.json(
        { error: 'Description exceeds maximum length of 1000 characters' },
        { status: 400 },
      )
    }

    const message = await prisma.disputeMessage.create({
      data: {
        disputeId: id,
        senderType: 'seller',
        senderEmail: user.email,
        message: description || `Evidence: ${documentType || 'document'}`,
        attachments: [
          {
            url: documentUrl,
            type: documentType || 'other',
            uploadedAt: new Date().toISOString(),
          },
        ],
      },
    })

    return NextResponse.json(
      {
        id: message.id,
        disputeId: message.disputeId,
        documentUrl,
        documentType: documentType || 'other',
        description: description || null,
        uploadedAt: message.createdAt,
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'Upload chargeback evidence error')
    return NextResponse.json({ error: 'Failed to upload evidence' }, { status: 500 })
  }
}
