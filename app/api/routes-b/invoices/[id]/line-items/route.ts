import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// POST /api/routes-b/invoices/[id]/line-items — add a line item to an invoice.
//
// Scoped to invoices owned by the authenticated user. Line items cannot be
// added to an invoice that has already been paid.

const MAX_DESCRIPTION_LENGTH = 500

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

async function findOwnedInvoice(invoiceId: string, userId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { id: true, status: true },
  })
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
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

    if (invoice.status === 'paid') {
      return NextResponse.json(
        { error: 'Cannot add a line item to an invoice that is already paid' },
        { status: 422 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const { description, quantity, unitPrice } = payload

    if (typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }

    if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` },
        { status: 400 },
      )
    }

    if (!isFiniteNumber(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
    }

    if (!isFiniteNumber(unitPrice) || unitPrice < 0) {
      return NextResponse.json(
        { error: 'unitPrice must be a non-negative number' },
        { status: 400 },
      )
    }

    const lastLineItem = await prisma.invoiceLineItem.findFirst({
      where: { invoiceId },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const position = (lastLineItem?.position ?? -1) + 1

    const lineItem = await prisma.invoiceLineItem.create({
      data: {
        invoiceId,
        description: description.trim(),
        quantity,
        unitPrice,
        position,
      },
      select: {
        id: true,
        description: true,
        quantity: true,
        unitPrice: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(
      {
        lineItem: {
          ...lineItem,
          quantity: Number(lineItem.quantity),
          unitPrice: Number(lineItem.unitPrice),
          createdAt: lineItem.createdAt.toISOString(),
          updatedAt: lineItem.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/[id]/line-items error')
    return NextResponse.json({ error: 'Failed to add invoice line item' }, { status: 500 })
  }
}
