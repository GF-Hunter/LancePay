import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET, POST /api/routes-b/invoices/[id]/notes — internal notes on an invoice

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true, name: true, email: true },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolvedParams = await params
    const { id } = resolvedParams

    if (!id || typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true, name: true, email: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        OR: [{ userId: user.id }, { clientId: user.id }],
      },
      select: { id: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const notes = await prisma.invoiceMessage.findMany({
      where: {
        invoiceId: id,
        isInternal: true,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceId: true,
        senderId: true,
        senderType: true,
        senderName: true,
        content: true,
        attachmentUrl: true,
        isInternal: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      notes: notes.map((n) => ({
        ...n,
        createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
      })),
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/invoices/[id]/notes error')
    return NextResponse.json({ error: 'Failed to fetch invoice notes' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolvedParams = await params
    const { id } = resolvedParams

    if (!id || typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true, name: true, email: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        OR: [{ userId: user.id }, { clientId: user.id }],
      },
      select: { id: true },
    })

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
    const content = payload.content ?? payload.note

    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'content is required and must be a non-empty string' },
        { status: 400 },
      )
    }

    if (content.length > 5000) {
      return NextResponse.json(
        { error: 'Content exceeds maximum length of 5000 characters' },
        { status: 400 },
      )
    }

    const attachmentUrl = typeof payload.attachmentUrl === 'string' ? payload.attachmentUrl : null

    const note = await prisma.invoiceMessage.create({
      data: {
        invoiceId: id,
        senderId: user.id,
        senderType: 'freelancer',
        senderName: user.name || user.email || 'Freelancer',
        content: content.trim(),
        attachmentUrl,
        isInternal: true,
      },
      select: {
        id: true,
        invoiceId: true,
        senderId: true,
        senderType: true,
        senderName: true,
        content: true,
        attachmentUrl: true,
        isInternal: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      {
        note: {
          ...note,
          createdAt: note.createdAt instanceof Date ? note.createdAt.toISOString() : note.createdAt,
        },
        id: note.id,
        content: note.content,
        createdAt: note.createdAt instanceof Date ? note.createdAt.toISOString() : note.createdAt,
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/notes error')
    return NextResponse.json({ error: 'Failed to create invoice note' }, { status: 500 })
  }
}
