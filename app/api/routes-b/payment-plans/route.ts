import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/payment-plans — list the authenticated user's installment payment plans.
// POST /api/routes-b/payment-plans — create an installment payment plan for one of their invoices.
//
// GET query params (all optional):
//   status — filter by plan status (active | completed | cancelled)
//   page   — 1-based page number (default: 1)
//   limit  — page size 1–100 (default: 25)

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const VALID_STATUSES = ['active', 'completed', 'cancelled'] as const
const VALID_FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

function parsePage(raw: string | null): number {
  if (!raw) return 1
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

function computeInstallmentDates(count: number, frequency: string, from: Date): Date[] {
  const dates: Date[] = []
  for (let i = 1; i <= count; i++) {
    const due = new Date(from)
    switch (frequency) {
      case 'weekly':
        due.setDate(due.getDate() + i * 7)
        break
      case 'biweekly':
        due.setDate(due.getDate() + i * 14)
        break
      default:
        due.setMonth(due.getMonth() + i)
    }
    dates.push(due)
  }
  return dates
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parsePage(searchParams.get('page'))
    const limit = parseLimit(searchParams.get('limit'))

    if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }

    const where = {
      userId: user.id,
      ...(status ? { status } : {}),
    }

    const [total, paymentPlans] = await Promise.all([
      prisma.paymentPlan.count({ where }),
      prisma.paymentPlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          invoiceId: true,
          totalAmount: true,
          currency: true,
          installmentCount: true,
          frequency: true,
          status: true,
          createdAt: true,
          _count: { select: { installments: true } },
        },
      }),
    ])

    return NextResponse.json({
      paymentPlans: paymentPlans.map((p) => ({
        id: p.id,
        invoiceId: p.invoiceId,
        totalAmount: Number(p.totalAmount),
        currency: p.currency,
        installmentCount: p.installmentCount,
        frequency: p.frequency,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        installmentsCreated: p._count.installments,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/payment-plans error')
    return NextResponse.json({ error: 'Failed to fetch payment plans' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const { invoiceId, installmentCount, frequency = 'monthly', startDate } = payload

    if (typeof invoiceId !== 'string' || !invoiceId.trim()) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    const parsedCount = Number(installmentCount)
    if (!Number.isInteger(parsedCount) || parsedCount < 2 || parsedCount > 60) {
      return NextResponse.json(
        { error: 'installmentCount must be an integer between 2 and 60' },
        { status: 400 },
      )
    }

    if (!(VALID_FREQUENCIES as readonly string[]).includes(frequency as string)) {
      return NextResponse.json(
        { error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` },
        { status: 400 },
      )
    }

    let fromDate = new Date()
    if (startDate !== undefined) {
      if (typeof startDate !== 'string') {
        return NextResponse.json({ error: 'startDate must be a valid ISO date string' }, { status: 400 })
      }
      const parsed = new Date(startDate)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'startDate must be a valid ISO date string' }, { status: 400 })
      }
      fromDate = parsed
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: user.id },
      select: { id: true, amount: true, currency: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const existingPlan = await prisma.paymentPlan.findUnique({ where: { invoiceId } })
    if (existingPlan) {
      return NextResponse.json(
        { error: 'A payment plan already exists for this invoice' },
        { status: 409 },
      )
    }

    const totalAmount = Number(invoice.amount)
    const installmentAmount = Math.round((totalAmount / parsedCount) * 100) / 100
    const dueDates = computeInstallmentDates(parsedCount, frequency as string, fromDate)

    const paymentPlan = await prisma.paymentPlan.create({
      data: {
        userId: user.id,
        invoiceId: invoice.id,
        totalAmount,
        currency: invoice.currency,
        installmentCount: parsedCount,
        frequency: frequency as string,
        status: 'active',
        installments: {
          create: dueDates.map((dueDate, i) => ({
            sequence: i + 1,
            // Absorb any rounding remainder into the final installment so the
            // sum of installment amounts always equals totalAmount exactly.
            amount:
              i === dueDates.length - 1
                ? Math.round((totalAmount - installmentAmount * (dueDates.length - 1)) * 100) / 100
                : installmentAmount,
            dueDate,
            status: 'pending',
          })),
        },
      },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    })

    return NextResponse.json(
      {
        paymentPlan: {
          id: paymentPlan.id,
          invoiceId: paymentPlan.invoiceId,
          totalAmount: Number(paymentPlan.totalAmount),
          currency: paymentPlan.currency,
          installmentCount: paymentPlan.installmentCount,
          frequency: paymentPlan.frequency,
          status: paymentPlan.status,
          createdAt: paymentPlan.createdAt.toISOString(),
          installments: paymentPlan.installments.map((i) => ({
            id: i.id,
            sequence: i.sequence,
            amount: Number(i.amount),
            dueDate: i.dueDate.toISOString(),
            status: i.status,
          })),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/payment-plans error')
    return NextResponse.json({ error: 'Failed to create payment plan' }, { status: 500 })
  }
}
