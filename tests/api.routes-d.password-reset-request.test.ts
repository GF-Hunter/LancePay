import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const findUnique = vi.fn()
const tokenUpdateMany = vi.fn()
const tokenCreate = vi.fn()
const transaction = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    passwordResetToken: { updateMany: tokenUpdateMany, create: tokenCreate },
    $transaction: transaction,
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/auth/password/reset-request'

function makeRequest(body: unknown) {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const GENERIC =
  'If an account exists for this email, a password reset link has been sent'

describe('POST /api/routes-d/auth/password/reset-request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
  })

  it.each(['not-an-email', '', 'a@b', 42, null])(
    'returns 400 for invalid email %s',
    async (email) => {
      const { POST } = await import('@/app/api/routes-d/auth/password/reset-request/route')
      const res = await POST(makeRequest({ email }))
      expect(res.status).toBe(400)
    },
  )

  it('returns the generic 202 for an unknown email without creating tokens', async () => {
    findUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/auth/password/reset-request/route')
    const res = await POST(makeRequest({ email: 'nobody@example.com' }))
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toEqual({ message: GENERIC })
    expect(tokenCreate).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('creates a token for a known email and returns the same generic 202', async () => {
    findUnique.mockResolvedValue({ id: 'user_1', email: 'ada@example.com' })
    tokenUpdateMany.mockResolvedValue({ count: 1 })
    tokenCreate.mockResolvedValue({ id: 'prt_1' })
    const { POST } = await import('@/app/api/routes-d/auth/password/reset-request/route')
    const res = await POST(makeRequest({ email: 'Ada@Example.com' }))
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toEqual({ message: GENERIC })

    // Email is normalised for lookup
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } })

    // Prior unused tokens are superseded, then one new token is created
    expect(tokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', used: false },
      data: { used: true },
    })
    const createArg = tokenCreate.mock.calls[0][0]
    expect(createArg.data.userId).toBe('user_1')
    expect(createArg.data.used).toBe(false)
    expect(createArg.data.token).toMatch(/^[0-9a-f]{64}$/)
    const ttl = createArg.data.expiresAt.getTime() - Date.now()
    expect(ttl).toBeGreaterThan(29 * 60 * 1000)
    expect(ttl).toBeLessThan(31 * 60 * 1000)
  })

  it('never leaks the token in the response', async () => {
    findUnique.mockResolvedValue({ id: 'user_1', email: 'ada@example.com' })
    tokenUpdateMany.mockResolvedValue({ count: 0 })
    tokenCreate.mockResolvedValue({ id: 'prt_1' })
    const { POST } = await import('@/app/api/routes-d/auth/password/reset-request/route')
    const res = await POST(makeRequest({ email: 'ada@example.com' }))
    const text = JSON.stringify(await res.json())
    const generatedToken = tokenCreate.mock.calls[0][0].data.token
    expect(text).not.toContain(generatedToken)
  })

  it('responds identically for known and unknown emails (anti-enumeration)', async () => {
    const { POST } = await import('@/app/api/routes-d/auth/password/reset-request/route')

    findUnique.mockResolvedValue(null)
    const unknownRes = await POST(makeRequest({ email: 'nobody@example.com' }))

    findUnique.mockResolvedValue({ id: 'user_1', email: 'ada@example.com' })
    tokenUpdateMany.mockResolvedValue({ count: 0 })
    tokenCreate.mockResolvedValue({ id: 'prt_1' })
    const knownRes = await POST(makeRequest({ email: 'ada@example.com' }))

    expect(unknownRes.status).toBe(knownRes.status)
    expect(await unknownRes.json()).toEqual(await knownRes.json())
  })

  it('returns 500 when token persistence fails', async () => {
    findUnique.mockResolvedValue({ id: 'user_1', email: 'ada@example.com' })
    transaction.mockRejectedValue(new Error('db down'))
    const { POST } = await import('@/app/api/routes-d/auth/password/reset-request/route')
    const res = await POST(makeRequest({ email: 'ada@example.com' }))
    expect(res.status).toBe(500)
  })
})
