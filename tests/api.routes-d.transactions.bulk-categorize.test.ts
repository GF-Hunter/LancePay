import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const transactionFindMany = vi.fn()
const transactionUpdateMany = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    transaction: {
      findMany: transactionFindMany,
      updateMany: transactionUpdateMany,
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-d/transactions/bulk-categorize'

function req(token: string | null = 'tok', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL, {
    method: 'POST',
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/routes-d/transactions/bulk-categorize', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 with invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/transactions/bulk-categorize/route')
    const res = await POST(req(null, { transactionIds: ['tx-1'], category: 'income' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/transactions/bulk-categorize/route')
    const res = await POST(req('tok', { transactionIds: ['tx-1'], category: 'income' }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when transactionIds is empty', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { POST } = await import('@/app/api/routes-d/transactions/bulk-categorize/route')
    const res = await POST(req('tok', { transactionIds: [], category: 'income' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when transactionIds exceeds limit', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const ids = Array.from({ length: 101 }, (_, i) => `tx-${i}`)
    const { POST } = await import('@/app/api/routes-d/transactions/bulk-categorize/route')
    const res = await POST(req('tok', { transactionIds: ids, category: 'income' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when category is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { POST } = await import('@/app/api/routes-d/transactions/bulk-categorize/route')
    const res = await POST(req('tok', { transactionIds: ['tx-1'] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid category', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { POST } = await import('@/app/api/routes-d/transactions/bulk-categorize/route')
    const res = await POST(req('tok', { transactionIds: ['tx-1'], category: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when transaction not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    transactionFindMany.mockResolvedValue([])
    const { POST } = await import('@/app/api/routes-d/transactions/bulk-categorize/route')
    const res = await POST(req('tok', { transactionIds: ['tx-1'], category: 'income' }))
    expect(res.status).toBe(404)
  })

  it('categorizes transactions successfully', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    transactionFindMany.mockResolvedValue([
      { id: 'tx-1' },
      { id: 'tx-2' },
    ])
    transactionUpdateMany.mockResolvedValue({ count: 2 })

    const { POST } = await import('@/app/api/routes-d/transactions/bulk-categorize/route')
    const res = await POST(req('tok', { transactionIds: ['tx-1', 'tx-2'], category: 'income' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.count).toBe(2)
    expect(json.category).toBe('income')
  })
})
