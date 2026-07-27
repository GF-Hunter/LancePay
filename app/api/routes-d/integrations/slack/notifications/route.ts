import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'

const MAX_WEBHOOK_URL_LENGTH = 512
const VALID_EVENTS = ['payout.completed', 'payout.failed', 'payout.pending', 'balance.low'] as const
type SlackEvent = (typeof VALID_EVENTS)[number]

type SlackNotificationConfig = {
  configId: string
  webhookUrl: string
  events: SlackEvent[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

function getMockConfig(userId: string): SlackNotificationConfig | null {
  // Simulate ~half of users having no config yet.
  const seed = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  if (seed % 3 === 0) return null

  return {
    configId: `slack_cfg_${userId.slice(0, 8)}`,
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/EXAMPLE',
    events: ['payout.completed', 'payout.failed'],
    enabled: true,
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-06-15T12:00:00Z',
  }
}

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  return claims ? claims.userId : null
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = getMockConfig(userId)
  if (!config) {
    return NextResponse.json({ configured: false, config: null })
  }

  return NextResponse.json({ configured: true, config })
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>

  const webhookUrl = typeof payload.webhookUrl === 'string' ? payload.webhookUrl.trim() : null
  if (!webhookUrl) {
    return NextResponse.json({ error: 'webhookUrl is required' }, { status: 400 })
  }
  if (webhookUrl.length > MAX_WEBHOOK_URL_LENGTH) {
    return NextResponse.json(
      { error: `webhookUrl must be at most ${MAX_WEBHOOK_URL_LENGTH} characters` },
      { status: 400 },
    )
  }
  if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
    return NextResponse.json(
      { error: 'webhookUrl must be a valid Slack incoming webhook URL (https://hooks.slack.com/...)' },
      { status: 400 },
    )
  }

  const rawEvents = Array.isArray(payload.events) ? payload.events : []
  const events = rawEvents.filter((e): e is SlackEvent => VALID_EVENTS.includes(e as SlackEvent))
  if (events.length === 0) {
    return NextResponse.json(
      { error: `events must contain at least one valid event: ${VALID_EVENTS.join(', ')}` },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const config: SlackNotificationConfig = {
    configId: `slack_cfg_${userId.slice(0, 8)}`,
    webhookUrl,
    events,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }

  return NextResponse.json({ configured: true, config }, { status: 201 })
}
