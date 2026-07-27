import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET /api/routes-d/ledger/export — export the double-entry ledger ──
//
// Produces a double-entry ledger view for the authenticated user by
// merging two source tables:
//
//   CREDIT entries — completed payment Transactions (money received)
//   DEBIT  entries — Expense rows               (money spent)
//
// Each entry carries the standard double-entry fields:
//   id, date, description, account, reference, debit, credit, currency
//
// A summary block at the end of the response contains aggregate totals
// and the net balance (totalCredits - totalDebits).
//
// Query params (all optional):
//   from     — ISO 8601 date; lower bound on entry date (inclusive)
//   to       — ISO 8601 date; upper bound on entry date (inclusive)
//   type     — "income" | "expense" | "all"  (default: "all")
//   currency — 3-letter currency code filter (case-insensitive)
//   page     — 1-based page number (default: 1)
//   limit    — page size 1–500 (default: 100)

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

const VALID_ENTRY_TYPES = ['income', 'expense', 'all'] as const
type EntryType = typeof VALID_ENTRY_TYPES[number]

type LedgerEntry = {
  id: string
  date: string
  description: string
  account: string
  reference: string | null
  debit: string
  credit: string
  currency: string
  entryType: 'income' | 'expense'
}

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
}

function parseDate(raw: string | null): Date | null | undefined {
  if (raw === null) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

function toDecimalString(value: unknown): string {
  if (value === null || value === undefined) return '0.00'
  const s = typeof (value as { toString?: () => string }).toString === 'function'
    ? (value as { toString: () => string }).toString()
    : String(value)
  // Ensure at least 2 decimal places for ledger readability
  return s.includes('.') ? s : `${s}.00`
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // ── Parameter parsing & validation ────────────────────────────────────
    const fromDate = parseDate(searchParams.get('from'))
    const toDate   = parseDate(searchParams.get('to'))

    if (fromDate === undefined) {
      return NextResponse.json(
        { error: 'from must be a valid ISO 8601 date' },
        { status: 400 },
      )
    }
    if (toDate === undefined) {
      return NextResponse.json(
        { error: 'to must be a valid ISO 8601 date' },
        { status: 400 },
      )
    }
    if (fromDate && toDate && fromDate > toDate) {
      return NextResponse.json(
        { error: 'from must not be later than to' },
        { status: 400 },
      )
    }

    const typeParam = searchParams.get('type') ?? 'all'
    if (!VALID_ENTRY_TYPES.includes(typeParam as EntryType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_ENTRY_TYPES.join(', ')}` },
        { status: 400 },
      )
    }
    const entryType = typeParam as EntryType

    const currencyParam = searchParams.get('currency')
    const currency = currencyParam ? currencyParam.trim().toUpperCase() : null
    if (currency !== null && !/^[A-Z]{2,10}$/.test(currency)) {
      return NextResponse.json(
        { error: 'currency must be a 2–10 letter code' },
        { status: 400 },
      )
    }

    const page  = parsePage(searchParams.get('page'))
    const limit = parseLimit(searchParams.get('limit'))

    // ── Date range helpers ────────────────────────────────────────────────
    const toEndOfDay = (d: Date): Date => {
      const end = new Date(d)
      end.setUTCHours(23, 59, 59, 999)
      return end
    }

    // ── Fetch income (credits) — completed payment transactions ──────────
    const incomeEntries: LedgerEntry[] = []
    let totalCredits = 0

    if (entryType === 'income' || entryType === 'all') {
      const txWhere: Record<string, unknown> = {
        userId: user.id,
        type: 'payment',
        status: 'completed',
      }
      if (fromDate || toDate) {
        const dateFilter: Record<string, Date> = {}
        if (fromDate) dateFilter.gte = fromDate
        if (toDate) dateFilter.lte = toEndOfDay(toDate)
        txWhere.createdAt = dateFilter
      }
      if (currency) txWhere.currency = currency

      const transactions = await prisma.transaction.findMany({
        where: txWhere,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          invoiceId: true,
          externalId: true,
          createdAt: true,
        },
      })

      for (const tx of transactions) {
        const amt = toDecimalString(tx.amount)
        totalCredits += Number(tx.amount)
        incomeEntries.push({
          id: tx.id as string,
          date: (tx.createdAt as Date).toISOString(),
          description: 'Payment received',
          account: 'Accounts Receivable',
          reference: (tx.invoiceId ?? tx.externalId ?? null) as string | null,
          debit: '0.00',
          credit: amt,
          currency: (tx.currency as string) || 'USDC',
          entryType: 'income',
        })
      }
    }

    // ── Fetch expenses (debits) ───────────────────────────────────────────
    const expenseEntries: LedgerEntry[] = []
    let totalDebits = 0

    if (entryType === 'expense' || entryType === 'all') {
      const expWhere: Record<string, unknown> = { userId: user.id }
      if (fromDate || toDate) {
        const dateFilter: Record<string, Date> = {}
        if (fromDate) dateFilter.gte = fromDate
        if (toDate) dateFilter.lte = toEndOfDay(toDate)
        expWhere.expenseDate = dateFilter
      }
      if (currency) expWhere.currency = currency

      const expenses = await prisma.expense.findMany({
        where: expWhere,
        orderBy: { expenseDate: 'desc' },
        select: {
          id: true,
          description: true,
          category: true,
          amount: true,
          currency: true,
          expenseDate: true,
        },
      })

      for (const exp of expenses) {
        const amt = toDecimalString(exp.amount)
        totalDebits += Number(exp.amount)
        expenseEntries.push({
          id: exp.id as string,
          date: (exp.expenseDate as Date).toISOString(),
          description: exp.description as string,
          account: exp.category as string,
          reference: null,
          debit: amt,
          credit: '0.00',
          currency: (exp.currency as string) || 'USDC',
          entryType: 'expense',
        })
      }
    }

    // ── Merge & sort all entries by date descending ───────────────────────
    const allEntries = [...incomeEntries, ...expenseEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )

    // ── Paginate ──────────────────────────────────────────────────────────
    const total = allEntries.length
    const paginatedEntries = allEntries.slice((page - 1) * limit, page * limit)

    const netBalance = totalCredits - totalDebits

    return NextResponse.json({
      entries: paginatedEntries,
      summary: {
        totalCredits: Math.round(totalCredits * 1_000_000) / 1_000_000,
        totalDebits:  Math.round(totalDebits  * 1_000_000) / 1_000_000,
        netBalance:   Math.round(netBalance   * 1_000_000) / 1_000_000,
        currency: currency ?? 'USDC',
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/ledger/export error')
    return NextResponse.json({ error: 'Failed to export ledger' }, { status: 500 })
  }
}
