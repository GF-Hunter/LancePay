import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { registerRoute } from '../../../_lib/openapi'
import { z } from 'zod'

registerRoute({
  method: 'PATCH',
  path: '/subscriptions/{id}/cancel',
  summary: 'Cancel subscription',
  description:
    'Cancel a subscription. Cancelled subscriptions are permanently stopped and will no longer generate invoices. Returns 409 if already cancelled.',
  responseSchema: z.object({
    id: z.string(),
    status: z.string(),
    updatedAt: z.string(),
  }),
  tags: ['subscriptions'],
})

async function resolveUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
  if (!user) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) }
  }
  return { user }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await resolveUser(request)
  if ('error' in auth) return auth.error

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  })

  if (!subscription) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  }

  if (subscription.userId !== auth.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (subscription.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Subscription is already cancelled' },
      { status: 409 },
    )
  }

  const updated = await prisma.subscription.update({
    where: { id },
    data: { status: 'cancelled' },
    select: { id: true, status: true, updatedAt: true },
  })

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    updatedAt: updated.updatedAt.toISOString(),
  })
}
