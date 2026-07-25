import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'USDC']

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: {
        id: true,
        email: true,
        timezone: true,
      },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    return NextResponse.json({
      userId: user.id,
      timezone: user.timezone || 'UTC',
      displayCurrency: 'USD',
    })
  } catch (error) {
    logger.error({ err: error }, 'Get currency preferences error')
    return NextResponse.json({ error: 'Failed to get currency preferences' }, { status: 500 })
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

    const { timezone, displayCurrency } = await request.json()

    const updates: Record<string, unknown> = {}

    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || timezone.trim().length === 0) {
        return NextResponse.json(
          { error: 'Timezone must be a non-empty string' },
          { status: 400 },
        )
      }
      updates.timezone = timezone
    }

    if (displayCurrency !== undefined) {
      if (!VALID_CURRENCIES.includes(displayCurrency)) {
        return NextResponse.json(
          { error: `Invalid currency. Supported: ${VALID_CURRENCIES.join(', ')}` },
          { status: 400 },
        )
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'At least one field must be provided' },
        { status: 400 },
      )
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updates,
      select: {
        id: true,
        email: true,
        timezone: true,
      },
    })

    return NextResponse.json({
      userId: updated.id,
      timezone: updated.timezone || 'UTC',
      displayCurrency: displayCurrency || 'USD',
    })
  } catch (error) {
    logger.error({ err: error }, 'Update currency preferences error')
    return NextResponse.json({ error: 'Failed to update currency preferences' }, { status: 500 })
  }
}
