import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(
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

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: user.id },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const messages = await prisma.invoiceMessage.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        senderId: true,
        senderType: true,
        senderName: true,
        content: true,
        attachmentUrl: true,
        isInternal: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ mentions: messages })
  } catch (error) {
    logger.error({ err: error }, 'Get mentions error')
    return NextResponse.json({ error: 'Failed to get mentions' }, { status: 500 })
  }
}

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

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: user.id },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const { content, mentionedUserIds = [], attachmentUrl } = await request.json()

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Content is required and must be a non-empty string' },
        { status: 400 },
      )
    }

    if (content.length > 5000) {
      return NextResponse.json(
        { error: 'Content exceeds maximum length of 5000 characters' },
        { status: 400 },
      )
    }

    const message = await prisma.invoiceMessage.create({
      data: {
        invoiceId: id,
        senderId: user.id,
        senderType: 'freelancer',
        senderName: user.name || user.email || 'Unknown',
        content,
        attachmentUrl: attachmentUrl || null,
        isInternal: true,
      },
    })

    return NextResponse.json(
      {
        id: message.id,
        senderId: message.senderId,
        senderType: message.senderType,
        senderName: message.senderName,
        content: message.content,
        attachmentUrl: message.attachmentUrl,
        isInternal: message.isInternal,
        createdAt: message.createdAt,
        mentionedUserIds,
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'Create mention error')
    return NextResponse.json({ error: 'Failed to create mention' }, { status: 500 })
  }
}
