import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const transactionFindMany = vi.fn()
const expenseFindMany = vi.fn()
const loggerError = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/logger', () => ({ logger: { error: loggerError } }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    transaction: { findMany: transactionFindMany },
    expense: { findMany: expenseFindMany },
  },
}))

const BASE_URL = 'http://localhost/api/routes-d/ledger/export'

function makeRequest(params: Record<string, string> = {}, token: string | null = 'Bearer token') {
  const url = new URL(BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(url.toString(), { headers })
}

const SAMPLE_TX = {
  id: 'tx_1',
  amount: { toString: () => '500.00' },
  currency: 'USDC',
  invoiceId: 'inv_1',
  externalId: 'ext_1',
  createdAt: new Date('2026-05-15T10:00:00Z'),
}

const SAMPLE_EXPENSE = {
  id: 'exp_1',
  description: 'Office supplies',
  category: 'Operations',
  amount: { toString: () => '75.00' },
  currency: 'USDC',
  expenseDate: new Date('2026-05-10T00:00:00Z'),
}

describe('GET /api/routes-d/ledger/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transactionFindMany.mockResolvedValue([])
    expenseFindMany.mockResolvedValue([])
  })

  // ── Auth ────────────────────────────────────────────────────────────────

  it('returns 401 when no authorization header is provided', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest({}, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
    expect(transactionFindMany).not.toHaveBeenCalled()
  })

  it('returns 401 when the token is invalid', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  // ── Validation ──────────────────────────────────────────────────────────

  it('returns 400 for an invalid from date', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest({ from: 'not-a-date' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from must be a valid ISO 8601 date/)
    expect(transactionFindMany).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid to date', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest({ to: 'bad' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/to must be a valid ISO 8601 date/)
  })

  it('returns 400 when from is later than to', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest({ from: '2026-07-01', to: '2026-06-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from must not be later than to/)
  })

  it('returns 400 for an invalid type parameter', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest({ type: 'unknown' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/type must be one of/)
  })

  it('returns 400 for an invalid currency code', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest({ currency: '1234' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/currency must be a/)
  })

  // ── Happy path — empty results ──────────────────────────────────────────

  it('returns 200 with empty entries and zero summary when no data exists', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toEqual([])
    expect(json.summary.totalCredits).toBe(0)
    expect(json.summary.totalDebits).toBe(0)
    expect(json.summary.netBalance).toBe(0)
    expect(json.pagination.page).toBe(1)
    expect(json.pagination.limit).toBe(100)
    expect(json.pagination.total).toBe(0)
  })

  // ── Income entries ──────────────────────────────────────────────────────

  it('maps completed transactions to credit entries with correct fields', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindMany.mockResolvedValue([SAMPLE_TX])
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.entries).toHaveLength(1)
    const entry = json.entries[0]
    expect(entry.id).toBe('tx_1')
    expect(entry.entryType).toBe('income')
    expect(entry.credit).toBe('500.00')
    expect(entry.debit).toBe('0.00')
    expect(entry.account).toBe('Accounts Receivable')
    expect(entry.reference).toBe('inv_1')
    expect(entry.currency).toBe('USDC')
  })

  it('queries transactions scoped to the authenticated user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    await GET(makeRequest())
    expect(transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user_1',
          type: 'payment',
          status: 'completed',
        }),
      }),
    )
  })

  // ── Expense entries ─────────────────────────────────────────────────────

  it('maps expenses to debit entries with correct fields', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    expenseFindMany.mockResolvedValue([SAMPLE_EXPENSE])
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.entries).toHaveLength(1)
    const entry = json.entries[0]
    expect(entry.id).toBe('exp_1')
    expect(entry.entryType).toBe('expense')
    expect(entry.debit).toBe('75.00')
    expect(entry.credit).toBe('0.00')
    expect(entry.account).toBe('Operations')
    expect(entry.description).toBe('Office supplies')
  })

  it('queries expenses scoped to the authenticated user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    await GET(makeRequest())
    expect(expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user_1' }),
      }),
    )
  })

  // ── type filter ─────────────────────────────────────────────────────────

  it('only fetches transactions when type=income', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    await GET(makeRequest({ type: 'income' }))
    expect(transactionFindMany).toHaveBeenCalled()
    expect(expenseFindMany).not.toHaveBeenCalled()
  })

  it('only fetches expenses when type=expense', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    await GET(makeRequest({ type: 'expense' }))
    expect(expenseFindMany).toHaveBeenCalled()
    expect(transactionFindMany).not.toHaveBeenCalled()
  })

  it('fetches both when type=all (default)', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    await GET(makeRequest())
    expect(transactionFindMany).toHaveBeenCalled()
    expect(expenseFindMany).toHaveBeenCalled()
  })

  // ── Summary totals ──────────────────────────────────────────────────────

  it('calculates summary totals and net balance correctly', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindMany.mockResolvedValue([SAMPLE_TX])          // credit 500
    expenseFindMany.mockResolvedValue([SAMPLE_EXPENSE])         // debit  75
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.summary.totalCredits).toBeCloseTo(500, 2)
    expect(json.summary.totalDebits).toBeCloseTo(75, 2)
    expect(json.summary.netBalance).toBeCloseTo(425, 2)
  })

  // ── Date filter ─────────────────────────────────────────────────────────

  it('passes from/to date range to the transaction createdAt filter', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    await GET(makeRequest({ from: '2026-01-01', to: '2026-06-30' }))
    expect(transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: new Date('2026-01-01'),
          }),
        }),
      }),
    )
  })

  it('passes from/to date range to the expense expenseDate filter', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    await GET(makeRequest({ from: '2026-01-01', to: '2026-06-30' }))
    expect(expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expenseDate: expect.objectContaining({
            gte: new Date('2026-01-01'),
          }),
        }),
      }),
    )
  })

  // ── Currency filter ─────────────────────────────────────────────────────

  it('passes currency filter to both queries when provided', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    await GET(makeRequest({ currency: 'usdc' }))
    expect(transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ currency: 'USDC' }) }),
    )
    expect(expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ currency: 'USDC' }) }),
    )
  })

  // ── Pagination ──────────────────────────────────────────────────────────

  it('paginates the merged result set correctly', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    // 3 transactions + 2 expenses = 5 total entries; page 2 with limit 2 = entries 3-4
    transactionFindMany.mockResolvedValue([
      { ...SAMPLE_TX, id: 'tx_1', createdAt: new Date('2026-06-03T00:00:00Z') },
      { ...SAMPLE_TX, id: 'tx_2', createdAt: new Date('2026-06-02T00:00:00Z') },
      { ...SAMPLE_TX, id: 'tx_3', createdAt: new Date('2026-06-01T00:00:00Z') },
    ])
    expenseFindMany.mockResolvedValue([
      { ...SAMPLE_EXPENSE, id: 'exp_1', expenseDate: new Date('2026-05-31T00:00:00Z') },
      { ...SAMPLE_EXPENSE, id: 'exp_2', expenseDate: new Date('2026-05-30T00:00:00Z') },
    ])
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest({ page: '2', limit: '2' }))
    const json = await res.json()
    expect(json.pagination.total).toBe(5)
    expect(json.pagination.page).toBe(2)
    expect(json.pagination.limit).toBe(2)
    expect(json.pagination.totalPages).toBe(3)
    expect(json.entries).toHaveLength(2)
  })

  it('clamps limit to the maximum of 500', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest({ limit: '9999' }))
    const json = await res.json()
    expect(json.pagination.limit).toBe(500)
  })

  // ── Error handling ──────────────────────────────────────────────────────

  it('returns 500 on an unexpected database error', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockRejectedValue(new Error('DB crash'))
    const { GET } = await import('@/app/api/routes-d/ledger/export/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to export ledger')
    expect(loggerError).toHaveBeenCalled()
  })
})
