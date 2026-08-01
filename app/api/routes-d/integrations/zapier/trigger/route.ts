import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// POST /api/routes-d/integrations/zapier/trigger — fires a Zapier REST Hook
// event to the caller's active webhook subscriptions.

const VALID_EVENTS = ['invoice.created', 'invoice.paid', 'invoice.overdue', 'payment.received'] as const
type ZapierEvent = (typeof VALID_EVENTS)[number]

export async function POST(request: NextRequest) {
  try {
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
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payloadBody = (body ?? {}) as Record<string, unknown>

    const event = typeof payloadBody.event === 'string' ? payloadBody.event.trim() : ''
    if (!event || !VALID_EVENTS.includes(event as ZapierEvent)) {
      return NextResponse.json(
        { error: `event must be one of: ${VALID_EVENTS.join(', ')}` },
        { status: 400 },
      )
    }

    const eventPayload =
      payloadBody.payload && typeof payloadBody.payload === 'object' && !Array.isArray(payloadBody.payload)
        ? (payloadBody.payload as Record<string, unknown>)
        : {}

    // Ownership is enforced by scoping the webhook lookup to the authenticated user.
    const webhooks = await prisma.userWebhook.findMany({
      where: {
        userId: user.id,
        isActive: true,
        status: 'ACTIVE',
        subscribedEvents: { has: event },
      },
      select: { id: true },
    })

    if (webhooks.length === 0) {
      return NextResponse.json(
        { triggered: 0, deliveries: [], event, triggeredAt: new Date().toISOString() },
        { status: 200 },
      )
    }

    const serializedPayload = JSON.stringify(eventPayload)
    const triggeredAt = new Date()

    const deliveries = await Promise.all(
      webhooks.map((webhook) =>
        prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            eventType: event,
            payload: serializedPayload,
            status: 'pending',
          },
          select: { id: true, webhookId: true, eventType: true, status: true },
        }),
      ),
    )

    await prisma.userWebhook.updateMany({
      where: { id: { in: webhooks.map((webhook) => webhook.id) } },
      data: { lastTriggeredAt: triggeredAt },
    })

    logger.info(
      { userId: user.id, event, triggered: deliveries.length },
      'POST /api/routes-d/integrations/zapier/trigger executed',
    )

    return NextResponse.json(
      { triggered: deliveries.length, deliveries, event, triggeredAt: triggeredAt.toISOString() },
      { status: 202 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/integrations/zapier/trigger error')
    return NextResponse.json({ error: 'Failed to trigger Zapier integration' }, { status: 500 })
  }
}
