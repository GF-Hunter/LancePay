import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET   /api/routes-b/language-preferences — retrieve the user's language/display preferences
// PATCH /api/routes-b/language-preferences — update the user's language/display preferences

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'pt', 'zh', 'ar', 'ja', 'ko']

const db = prisma as unknown as {
  languagePreference: {
    findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
    upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const prefs = await db.languagePreference.findUnique({
      where: { userId: user.id },
    })

    logger.info({ userId: user.id }, 'GET /api/routes-b/language-preferences')
    return NextResponse.json({ preferences: prefs ?? { locale: 'en', dateFormat: null, numberFormat: null } })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/language-preferences error')
    return NextResponse.json({ error: 'Failed to fetch language preferences' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as {
      locale?: string
      dateFormat?: string
      numberFormat?: string
    } | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { locale, dateFormat, numberFormat } = body

    if (locale !== undefined) {
      if (typeof locale !== 'string' || !SUPPORTED_LOCALES.includes(locale)) {
        return NextResponse.json(
          { error: `locale must be one of: ${SUPPORTED_LOCALES.join(', ')}` },
          { status: 400 },
        )
      }
    }

    const updateData: Record<string, unknown> = {}
    if (locale !== undefined) updateData.locale = locale
    if (dateFormat !== undefined) updateData.dateFormat = typeof dateFormat === 'string' ? dateFormat.trim() || null : null
    if (numberFormat !== undefined) updateData.numberFormat = typeof numberFormat === 'string' ? numberFormat.trim() || null : null

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'At least one field must be provided' }, { status: 400 })
    }

    const preferences = await db.languagePreference.upsert({
      where: { userId: user.id },
      update: { ...updateData, updatedAt: new Date() },
      create: { userId: user.id, locale: 'en', ...updateData },
    })

    logger.info({ userId: user.id }, 'PATCH /api/routes-b/language-preferences updated')
    return NextResponse.json({ preferences })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/routes-b/language-preferences error')
    return NextResponse.json({ error: 'Failed to update language preferences' }, { status: 500 })
  }
}
