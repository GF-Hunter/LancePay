import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const invoiceFindMany = vi.fn()
const loggerError = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/logger', () => ({ logger: { error: loggerError, info: vi.fn() } }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    invoice: { findMany: invoiceFindMany },
  },
}))

const URL = 'http://localhost/api/routes-b/invoices/summaries/monthly'

function makeRequest(method = 'GET', body?: unknown, search = '', token: string | null = 'token') {
  const headers = new Headers()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new NextRequest(`${URL}${search}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/routes-b/invoices/summaries/monthly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when authorization header is missing', async () => {
    const { GET } = await import('@/app/api/routes-b/invoices/summaries/monthly/route')
    const response = await GET(makeRequest('GET', undefined, '', null))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 for invalid year parameter', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })

    const { GET } = await import('@/app/api/routes-b/invoices/summaries/monthly/route')
    const response = await GET(makeRequest('GET', undefined, '?year=abc'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid year parameter' })
  })

  it('returns 200 with monthly summary array', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    invoiceFindMany.mockResolvedValue([
      { id: 'inv_1', status: 'PAID', totalAmount: 100, createdAt: new Date('2026-01-15T00:00:00Z') },
    ])

    const { GET } = await import('@/app/api/routes-b/invoices/summaries/monthly/route')
    const response = await GET(makeRequest('GET', undefined, '?year=2026'))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.year).toBe(2026)
    expect(json.summaries).toHaveLength(12)
    expect(json.summaries[0].paidInvoices).toBe(1)
    expect(json.summaries[0].paidAmount).toBe(100)
  })
})

describe('POST /api/routes-b/invoices/summaries/monthly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for invalid month parameter', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })

    const { POST } = await import('@/app/api/routes-b/invoices/summaries/monthly/route')
    const response = await POST(makeRequest('POST', { year: 2026, month: 13 }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid month parameter' })
  })

  it('returns 200 on generating report summary', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })

    const { POST } = await import('@/app/api/routes-b/invoices/summaries/monthly/route')
    const response = await POST(makeRequest('POST', { year: 2026, month: 7 }))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.message).toBe('Monthly invoice summary report generated successfully')
    expect(json.summary.month).toBe(7)
  })
})
