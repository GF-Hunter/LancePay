import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const MAX_ENDPOINT_LENGTH = 2048
const MAX_KEY_LENGTH = 512

type PushSubscriptionDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function getPushSubscriptionDelegate(): PushSubscriptionDelegate {
  return (prisma as unknown as { pushSubscription: PushSubscriptionDelegate }).pushSubscription
}

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return null
  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
  return user ? user.id : null
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

  const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint.trim() : null
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })
  }
  if (endpoint.length > MAX_ENDPOINT_LENGTH) {
    return NextResponse.json(
      { error: `endpoint must be at most ${MAX_ENDPOINT_LENGTH} characters` },
      { status: 400 },
    )
  }
  try {
    new URL(endpoint)
  } catch {
    return NextResponse.json({ error: 'endpoint must be a valid URL' }, { status: 400 })
  }

  const keys = payload.keys
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) {
    return NextResponse.json({ error: 'keys is required and must be an object' }, { status: 400 })
  }
  const { p256dh, auth } = keys as Record<string, unknown>

  const p256dhKey = typeof p256dh === 'string' ? p256dh.trim() : null
  if (!p256dhKey) {
    return NextResponse.json({ error: 'keys.p256dh is required' }, { status: 400 })
  }
  if (p256dhKey.length > MAX_KEY_LENGTH) {
    return NextResponse.json(
      { error: `keys.p256dh must be at most ${MAX_KEY_LENGTH} characters` },
      { status: 400 },
    )
  }

  const authKey = typeof auth === 'string' ? auth.trim() : null
  if (!authKey) {
    return NextResponse.json({ error: 'keys.auth is required' }, { status: 400 })
  }
  if (authKey.length > MAX_KEY_LENGTH) {
    return NextResponse.json(
      { error: `keys.auth must be at most ${MAX_KEY_LENGTH} characters` },
      { status: 400 },
    )
  }

  const userAgent = typeof payload.userAgent === 'string' ? payload.userAgent.trim() || null : null

  const delegate = getPushSubscriptionDelegate()

  const existing = await delegate.findUnique({ where: { endpoint } })
  if (existing && (existing as { userId: string }).userId !== userId) {
    return NextResponse.json({ error: 'endpoint is registered to another user' }, { status: 409 })
  }

  const subscription = await delegate.upsert({
    where: { endpoint },
    update: {
      userId,
      p256dh: p256dhKey,
      auth: authKey,
      userAgent,
      updatedAt: new Date(),
    },
    create: {
      userId,
      endpoint,
      p256dh: p256dhKey,
      auth: authKey,
      userAgent,
    },
    select: {
      id: true,
      endpoint: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ subscription }, { status: 200 })
}
