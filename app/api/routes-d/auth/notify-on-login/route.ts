import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const DEFAULTS = {
  notifyOnNewDevice: true,
  notifyEmail: null as string | null,
}

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const settings = await prisma.loginNotificationSettings.findUnique({
      where: { userId: user.id },
    })

    return NextResponse.json({
      settings: settings
        ? {
            notifyOnNewDevice: settings.notifyOnNewDevice,
            notifyEmail: settings.notifyEmail,
            updatedAt: settings.updatedAt,
          }
        : { ...DEFAULTS, updatedAt: null },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/auth/notify-on-login error')
    return NextResponse.json({ error: 'Failed to fetch notify-on-login settings' }, { status: 500 })
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

    const body = await request.json()
    const { notifyOnNewDevice, notifyEmail } = body

    const updates: Record<string, unknown> = {}

    if (notifyOnNewDevice !== undefined) {
      if (typeof notifyOnNewDevice !== 'boolean') {
        return NextResponse.json(
          { error: 'notifyOnNewDevice must be a boolean' },
          { status: 400 },
        )
      }
      updates.notifyOnNewDevice = notifyOnNewDevice
    }

    if (notifyEmail !== undefined) {
      if (notifyEmail !== null && (typeof notifyEmail !== 'string' || !notifyEmail.includes('@'))) {
        return NextResponse.json(
          { error: 'notifyEmail must be a valid email address or null' },
          { status: 400 },
        )
      }
      updates.notifyEmail = notifyEmail
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'At least one field must be provided' },
        { status: 400 },
      )
    }

    const settings = await prisma.loginNotificationSettings.upsert({
      where: { userId: user.id },
      update: updates,
      create: { userId: user.id, ...DEFAULTS, ...updates },
    })

    return NextResponse.json({
      settings: {
        notifyOnNewDevice: settings.notifyOnNewDevice,
        notifyEmail: settings.notifyEmail,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/routes-d/auth/notify-on-login error')
    return NextResponse.json({ error: 'Failed to update notify-on-login settings' }, { status: 500 })
  }
}
