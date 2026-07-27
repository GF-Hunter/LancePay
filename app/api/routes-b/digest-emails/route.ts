import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/digest-emails — get the authenticated user's recurring digest email settings
// POST /api/routes-b/digest-emails — create or update the authenticated user's digest email settings

const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId } })
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const settings = await prisma.digestEmailSettings.findUnique({
      where: { userId: user.id },
    })

    return NextResponse.json({
      settings: settings ?? { enabled: true, frequency: 'weekly', lastSentAt: null },
    })
  } catch (error) {
    logger.error({ err: error }, 'Get digest email settings error')
    return NextResponse.json({ error: 'Failed to get digest email settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as {
      enabled?: boolean
      frequency?: string
    } | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { enabled, frequency } = body

    if (frequency !== undefined && !VALID_FREQUENCIES.includes(frequency as typeof VALID_FREQUENCIES[number])) {
      return NextResponse.json(
        { error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` },
        { status: 400 },
      )
    }
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    const settings = await prisma.digestEmailSettings.upsert({
      where: { userId: user.id },
      update: {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(frequency !== undefined ? { frequency } : {}),
      },
      create: {
        userId: user.id,
        enabled: enabled ?? true,
        frequency: frequency ?? 'weekly',
      },
    })

    return NextResponse.json({ settings })
  } catch (error) {
    logger.error({ err: error }, 'Configure digest email settings error')
    return NextResponse.json({ error: 'Failed to configure digest email settings' }, { status: 500 })
  }
}
