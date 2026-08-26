import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// PATCH  /api/routes-b/invoices/[id]/line-items/[itemId] — update an invoice line item.
// DELETE /api/routes-b/invoices/[id]/line-items/[itemId] — delete an invoice line item.
//
// Both are scoped to invoices owned by the authenticated user. Line items
// cannot be modified or removed once the invoice has already been paid.

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

async function findLineItem(itemId: string, invoiceId: string) {
  return prisma.invoiceLineItem.findFirst({
    where: { id: itemId, invoiceId },
    select: { id: true },
  })
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id: invoiceId, itemId } = await params
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!invoiceId || !invoiceId.trim()) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    if (!itemId || !itemId.trim()) {
      return NextResponse.json({ error: 'Line item ID is required' }, { status: 400 })
    }

    const invoice = await findOwnedInvoice(invoiceId, user.id)
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const lineItem = await findLineItem(itemId, invoiceId)
    if (!lineItem) {
      return NextResponse.json({ error: 'Line item not found' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json(
        { error: 'Cannot update a line item on an invoice that is already paid' },
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

    if (
      description === undefined &&
      quantity === undefined &&
      unitPrice === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one of description, quantity, unitPrice is required' },
        { status: 400 },
      )
    }

    const data: { description?: string; quantity?: number; unitPrice?: number } = {}

    if (description !== undefined) {
      if (typeof description !== 'string' || !description.trim()) {
        return NextResponse.json({ error: 'description must be a non-empty string' }, { status: 400 })
      }
      if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
        return NextResponse.json(
          { error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` },
          { status: 400 },
        )
      }
      data.description = description.trim()
    }

    if (quantity !== undefined) {
      if (!isFiniteNumber(quantity) || quantity <= 0) {
        return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
      }
      data.quantity = quantity
    }

    if (unitPrice !== undefined) {
      if (!isFiniteNumber(unitPrice) || unitPrice < 0) {
        return NextResponse.json(
          { error: 'unitPrice must be a non-negative number' },
          { status: 400 },
        )
      }
      data.unitPrice = unitPrice
    }

    const updated = await prisma.invoiceLineItem.update({
      where: { id: itemId },
      data,
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

    return NextResponse.json({
      lineItem: {
        ...updated,
        quantity: Number(updated.quantity),
        unitPrice: Number(updated.unitPrice),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/routes-b/invoices/[id]/line-items/[itemId] error')
    return NextResponse.json({ error: 'Failed to update invoice line item' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id: invoiceId, itemId } = await params
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!invoiceId || !invoiceId.trim()) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    if (!itemId || !itemId.trim()) {
      return NextResponse.json({ error: 'Line item ID is required' }, { status: 400 })
    }

    const invoice = await findOwnedInvoice(invoiceId, user.id)
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const lineItem = await findLineItem(itemId, invoiceId)
    if (!lineItem) {
      return NextResponse.json({ error: 'Line item not found' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json(
        { error: 'Cannot delete a line item from an invoice that is already paid' },
        { status: 422 },
      )
    }

    await prisma.invoiceLineItem.delete({ where: { id: itemId } })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    logger.error({ err: error }, 'DELETE /api/routes-b/invoices/[id]/line-items/[itemId] error')
    return NextResponse.json({ error: 'Failed to delete invoice line item' }, { status: 500 })
  }
}
