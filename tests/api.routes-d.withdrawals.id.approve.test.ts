import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const withdrawalFindFirst = vi.fn()
const withdrawalUpdate = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    withdrawalTransaction: { findFirst: withdrawalFindFirst, update: withdrawalUpdate },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

function makeRequest(opts?: { auth?: string }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const auth = opts?.auth ?? 'Bearer token'
  if (auth) headers.authorization = auth
  return new NextRequest('http://localhost/api/routes-d/withdrawals/wd_1/approve', {
    method: 'POST',
    headers,
  })
}

const ctx = { params: { id: 'wd_1' } }

describe('POST /api/routes-d/withdrawals/[id]/approve', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no auth is supplied', async () => {
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/approve/route')
    const res = await POST(makeRequest({ auth: '' }), ctx)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the withdrawal does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindFirst.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/approve/route')
    const res = await POST(makeRequest(), ctx)
    expect(res.status).toBe(404)
  })

  it('returns 403 when the withdrawal belongs to another user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindFirst.mockResolvedValue({ id: 'wd_1', userId: 'someone_else', status: 'pending' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/approve/route')
    const res = await POST(makeRequest(), ctx)
    expect(res.status).toBe(403)
    expect(withdrawalUpdate).not.toHaveBeenCalled()
  })

  it('returns 409 when the withdrawal is in a non-approvable status', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindFirst.mockResolvedValue({ id: 'wd_1', userId: 'user_1', status: 'completed' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/approve/route')
    const res = await POST(makeRequest(), ctx)
    expect(res.status).toBe(409)
    expect(withdrawalUpdate).not.toHaveBeenCalled()
  })

  it('approves a pending withdrawal and returns 200', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindFirst.mockResolvedValue({ id: 'wd_1', userId: 'user_1', status: 'pending' })
    withdrawalUpdate.mockResolvedValue({
      id: 'wd_1',
      status: 'submitted',
      amount: 100,
      asset: 'USDC',
      anchorId: 'moneygram',
      updatedAt: new Date(),
    })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/approve/route')
    const res = await POST(makeRequest(), ctx)
    expect(res.status).toBe(200)
    expect(withdrawalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wd_1' },
        data: expect.objectContaining({ status: 'submitted' }),
      }),
    )
    const json = await res.json()
    expect(json.withdrawal.status).toBe('submitted')
    expect(json.withdrawal.amount).toBe(100)
  })

  it('approves a queued withdrawal', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindFirst.mockResolvedValue({ id: 'wd_1', userId: 'user_1', status: 'queued' })
    withdrawalUpdate.mockResolvedValue({ id: 'wd_1', status: 'submitted', amount: 50, asset: 'USDC', anchorId: 'yellowcard', updatedAt: new Date() })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/approve/route')
    const res = await POST(makeRequest(), ctx)
    expect(res.status).toBe(200)
  })
})
