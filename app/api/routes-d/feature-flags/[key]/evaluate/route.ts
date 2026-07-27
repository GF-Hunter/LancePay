import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// POST /api/routes-d/feature-flags/[key]/evaluate — Evaluate a feature flag for the authenticated user

type EvaluationReason =
  | 'user_targeted'
  | 'role_override'
  | 'percentage_rollout'
  | 'default_enabled'
  | 'default_disabled'
  | 'custom_rule'

const KNOWN_FLAGS: Record<string, { defaultEnabled: boolean; allowedRoles?: string[]; rolloutPercentage?: number }> = {
  crypto_payments: { defaultEnabled: true },
  auto_swap: { defaultEnabled: true },
  ai_invoicing: { defaultEnabled: false, rolloutPercentage: 50 },
  instant_payouts: { defaultEnabled: true, allowedRoles: ['admin', 'verified_user'] },
  beta_analytics: { defaultEnabled: false, allowedRoles: ['admin'] },
  chainalysis_screening: { defaultEnabled: true },
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params

    if (!key || typeof key !== 'string' || key.trim() === '') {
      return NextResponse.json({ error: 'Feature flag key is required' }, { status: 400 })
    }

    const cleanKey = key.trim().toLowerCase()

    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true, email: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let body: Record<string, unknown> = {}
    try {
      const text = await request.text()
      if (text.trim().length > 0) {
        body = JSON.parse(text)
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const context = (body.context && typeof body.context === 'object' ? body.context : {}) as Record<string, unknown>
    const defaultOverride = typeof body.defaultEnabled === 'boolean' ? body.defaultEnabled : undefined

    let enabled = false
    let reason: EvaluationReason = 'default_disabled'

    if (defaultOverride !== undefined) {
      enabled = defaultOverride
      reason = 'custom_rule'
    } else {
      const flagConfig = KNOWN_FLAGS[cleanKey]

      if (!flagConfig) {
        enabled = false
        reason = 'default_disabled'
      } else if (flagConfig.allowedRoles && user.role && flagConfig.allowedRoles.includes(user.role)) {
        enabled = true
        reason = 'role_override'
      } else if (flagConfig.rolloutPercentage !== undefined) {
        const charSum = user.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
        const userPercentage = charSum % 100
        enabled = userPercentage < flagConfig.rolloutPercentage
        reason = 'percentage_rollout'
      } else {
        enabled = flagConfig.defaultEnabled
        reason = flagConfig.defaultEnabled ? 'default_enabled' : 'default_disabled'
      }
    }

    const result = {
      key: cleanKey,
      enabled,
      reason,
      evaluatedAt: new Date().toISOString(),
      user: {
        id: user.id,
        role: user.role,
      },
      context,
    }

    logger.info({ userId: user.id, flag: cleanKey, enabled, reason }, 'POST /api/routes-d/feature-flags/[key]/evaluate succeeded')

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/feature-flags/[key]/evaluate error')
    return NextResponse.json({ error: 'Failed to evaluate feature flag' }, { status: 500 })
  }
}
