import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET/POST /api/routes-b/invoices/summaries/yearly — aggregated invoice
// totals for a given calendar year, broken down by status, currency, and month.

const YEAR_REGEX = /^\d{4}$/
const MIN_YEAR = 2000

type InvoiceRow = {
  amount: unknown
  currency: string
  status: string
  createdAt: Date
}

type Breakdown = Record<string, { count: number; amount: number }>

function buildStatusBreakdown(rows: InvoiceRow[]): Breakdown {
  const breakdown: Breakdown = {}
  for (const row of rows) {
    breakdown[row.status] = breakdown[row.status] ?? { count: 0, amount: 0 }
    breakdown[row.status].count += 1
    breakdown[row.status].amount += Number(row.amount)
  }
  return breakdown
}

function buildCurrencyBreakdown(rows: InvoiceRow[]): Breakdown {
  const breakdown: Breakdown = {}
  for (const row of rows) {
    const currency = row.currency ?? 'USD'
    breakdown[currency] = breakdown[currency] ?? { count: 0, amount: 0 }
    breakdown[currency].count += 1
    breakdown[currency].amount += Number(row.amount)
  }
  return breakdown
}

function buildMonthlyBreakdown(rows: InvoiceRow[]) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0, amount: 0 }))
  for (const row of rows) {
    const monthIndex = row.createdAt.getUTCMonth()
    months[monthIndex].count += 1
    months[monthIndex].amount += Number(row.amount)
  }
  return months
}

function parseYear(raw: string | null): { year: number } | { error: string } {
  const currentYear = new Date().getUTCFullYear()
  if (raw === null || raw === '') {
    return { year: currentYear }
  }
  if (!YEAR_REGEX.test(raw)) {
    return { error: 'year must be a 4-digit number, e.g. 2026' }
  }
  const year = parseInt(raw, 10)
  if (year < MIN_YEAR || year > currentYear) {
    return { error: `year must be between ${MIN_YEAR} and ${currentYear}` }
  }
  return { year }
}

async function buildYearlySummary(userId: string, year: number) {
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))

  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      createdAt: { gte: yearStart, lt: yearEnd },
    },
    select: {
      amount: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  })

  const totalAmount = invoices.reduce((sum, row) => sum + Number(row.amount), 0)

  return {
    year,
    yearStart: yearStart.toISOString(),
    yearEnd: yearEnd.toISOString(),
    generatedAt: new Date().toISOString(),
    totalInvoices: invoices.length,
    totalAmount,
    byStatus: buildStatusBreakdown(invoices),
    byCurrency: buildCurrencyBreakdown(invoices),
    monthlyBreakdown: buildMonthlyBreakdown(invoices),
  }
}

type AuthResult =
  | { ok: true; user: { id: string } }
  | { ok: false; status: 401 | 404; error: string }

async function getAuthenticatedUser(request: NextRequest): Promise<AuthResult> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const claims = await verifyAuthToken(authToken)
  if (!claims) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  // Ownership for this endpoint is enforced by scoping all queries to this user's id.
  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
  if (!user) {
    return { ok: false, status: 404, error: 'User not found' }
  }

  return { ok: true, user }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const parsed = parseYear(searchParams.get('year'))
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const summary = await buildYearlySummary(auth.user.id, parsed.year)
    return NextResponse.json({ summary })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/invoices/summaries/yearly error')
    return NextResponse.json({ error: 'Failed to fetch yearly invoice summary' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const rawYear =
      typeof payload.year === 'number'
        ? String(Math.trunc(payload.year))
        : typeof payload.year === 'string'
          ? payload.year.trim()
          : null

    const parsed = parseYear(rawYear)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const summary = await buildYearlySummary(auth.user.id, parsed.year)
    return NextResponse.json({ summary }, { status: 200 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/invoices/summaries/yearly error')
    return NextResponse.json({ error: 'Failed to generate yearly invoice summary' }, { status: 500 })
  }
}
