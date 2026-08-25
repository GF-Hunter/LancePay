import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/payment-plans/[id] — fetch a single installment payment plan,
// including its installment schedule, scoped to the authenticated owner.

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!id || !id.trim()) {
      return NextResponse.json({ error: 'Payment plan ID is required' }, { status: 400 })
    }

    const paymentPlan = await prisma.paymentPlan.findUnique({
      where: { id },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    })

    if (!paymentPlan) {
      return NextResponse.json({ error: 'Payment plan not found' }, { status: 404 })
    }

    if (paymentPlan.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      paymentPlan: {
        id: paymentPlan.id,
        invoiceId: paymentPlan.invoiceId,
        totalAmount: Number(paymentPlan.totalAmount),
        currency: paymentPlan.currency,
        installmentCount: paymentPlan.installmentCount,
        frequency: paymentPlan.frequency,
        status: paymentPlan.status,
        createdAt: paymentPlan.createdAt.toISOString(),
        updatedAt: paymentPlan.updatedAt.toISOString(),
        installments: paymentPlan.installments.map((i) => ({
          id: i.id,
          sequence: i.sequence,
          amount: Number(i.amount),
          dueDate: i.dueDate.toISOString(),
          status: i.status,
          paidAt: i.paidAt?.toISOString() ?? null,
        })),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/payment-plans/[id] error')
    return NextResponse.json({ error: 'Failed to fetch payment plan' }, { status: 500 })
  }
}
