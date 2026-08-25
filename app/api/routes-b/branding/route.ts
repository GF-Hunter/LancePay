import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// PATCH /api/routes-b/branding — update the authenticated user's branding settings.

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

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
        return NextResponse.json({ error: 'logoUrl must be a valid URL or null' }, { status: 400 })
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
        return NextResponse.json({ error: 'signatureUrl must be a valid URL or null' }, { status: 400 })
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

    return NextResponse.json({ branding })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/routes-b/branding error')
    return NextResponse.json({ error: 'Failed to update branding settings' }, { status: 500 })
  }
}
