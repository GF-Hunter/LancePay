import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { registerRoute } from '../../_lib/openapi'
import { z } from 'zod'

registerRoute({
  method: 'GET',
  path: '/subscriptions/{id}',
  summary: 'Get subscription',
  description: 'Fetch a single recurring subscription by ID.',
  responseSchema: z.object({
    subscription: z.object({
      id: z.string(),
      clientEmail: z.string(),
      clientName: z.string().nullable(),
      description: z.string(),
      amount: z.number(),
      currency: z.string(),
      frequency: z.string(),
      interval: z.number(),
      status: z.string(),
      nextGenerationDate: z.string(),
      lastGeneratedAt: z.string().nullable(),
      invoiceCount: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await resolveUser(request)
  if ('error' in auth) return auth.error

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: { _count: { select: { invoices: true } } },
  })

  if (!subscription) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  }

  if (subscription.userId !== auth.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    subscription: {
      id: subscription.id,
      clientEmail: subscription.clientEmail,
      clientName: subscription.clientName,
      description: subscription.description,
      amount: Number(subscription.amount),
      currency: subscription.currency,
      frequency: subscription.frequency,
      interval: subscription.interval,
      status: subscription.status,
      nextGenerationDate: subscription.nextGenerationDate.toISOString(),
      lastGeneratedAt: subscription.lastGeneratedAt?.toISOString() ?? null,
      invoiceCount: subscription._count.invoices,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    },
  })
}
