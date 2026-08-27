import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET, PATCH /api/routes-b/invoices/[id]/branding — per-invoice branding override

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
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
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        OR: [{ userId: user.id }, { clientId: user.id }],
      },
      select: { id: true, userId: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const branding = await prisma.brandingSettings.findUnique({
      where: { userId: invoice.userId },
      select: {
        id: true,
        logoUrl: true,
        primaryColor: true,
        footerText: true,
        signatureUrl: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      branding: branding || null,
      invoiceId: id,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/invoices/[id]/branding error')
    return NextResponse.json({ error: 'Failed to fetch invoice branding' }, { status: 500 })
  }
}

export async function PATCH(
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
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        userId: user.id,
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
    const { logoUrl, primaryColor, footerText, signatureUrl } = payload

    const updates: Record<string, unknown> = {}

    if (logoUrl !== undefined) {
      if (logoUrl !== null && (typeof logoUrl !== 'string' || !isValidUrl(logoUrl))) {
        return NextResponse.json(
          { error: 'logoUrl must be a valid HTTP or HTTPS URL or null' },
          { status: 400 },
        )
      }
      updates.logoUrl = logoUrl
    }

    if (primaryColor !== undefined) {
      if (typeof primaryColor !== 'string' || !HEX_COLOR_REGEX.test(primaryColor)) {
        return NextResponse.json(
          { error: 'primaryColor must be a hex color string, e.g. #000000' },
          { status: 400 },
        )
      }
      updates.primaryColor = primaryColor
    }

    if (footerText !== undefined) {
      if (footerText !== null && typeof footerText !== 'string') {
        return NextResponse.json({ error: 'footerText must be a string or null' }, { status: 400 })
      }
      updates.footerText = footerText
    }

    if (signatureUrl !== undefined) {
      if (signatureUrl !== null && (typeof signatureUrl !== 'string' || !isValidUrl(signatureUrl))) {
        return NextResponse.json(
          { error: 'signatureUrl must be a valid HTTP or HTTPS URL or null' },
          { status: 400 },
        )
      }
      updates.signatureUrl = signatureUrl
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'At least one field must be provided' }, { status: 400 })
    }

    const branding = await prisma.brandingSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...updates },
      update: updates,
      select: {
        id: true,
        logoUrl: true,
        primaryColor: true,
        footerText: true,
        signatureUrl: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      branding,
      invoiceId: id,
    })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/routes-b/invoices/[id]/branding error')
    return NextResponse.json({ error: 'Failed to update invoice branding' }, { status: 500 })
  }
}
