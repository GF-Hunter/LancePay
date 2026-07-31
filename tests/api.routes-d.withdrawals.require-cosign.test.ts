import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const withdrawalFindUnique = vi.fn()
const withdrawalUpdate = vi.fn()
const loggerError = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/logger', () => ({ logger: { error: loggerError } }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    withdrawalTransaction: {
      findUnique: withdrawalFindUnique,
      update: withdrawalUpdate,
    },
  },
}))

const BASE_URL = 'http://localhost/api/routes-d/withdrawals/wd_1/require-cosign'
const ctx = { params: Promise.resolve({ id: 'wd_1' }) }

function makeRequest(body?: unknown, opts?: { auth?: string | null }) {
  const authValue = opts?.auth === undefined ? 'Bearer token' : opts.auth
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (authValue) headers.authorization = authValue
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const PENDING_WITHDRAWAL = {
  id: 'wd_1',
  userId: 'user_1',
  status: 'pending',
  cosignerId: null,
}

const UPDATED_WITHDRAWAL = {
  id: 'wd_1',
  userId: 'user_1',
  status: 'pending',
  cosignerId: 'cosigner_1',
  amount: { valueOf: () => 250 },
  asset: 'USDC',
  updatedAt: new Date('2026-07-01T10:00:00Z'),
}

describe('POST /api/routes-d/withdrawals/[id]/require-cosign', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Auth ────────────────────────────────────────────────────────────────

  it('returns 401 when no authorization header is provided', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }, { auth: null }), ctx)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
    expect(withdrawalFindUnique).not.toHaveBeenCalled()
  })

  it('returns 401 when the token is invalid', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    expect(res.status).toBe(401)
  })

  // ── Body validation ─────────────────────────────────────────────────────

  it('returns 400 when the body is not valid JSON', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const req = new NextRequest(BASE_URL, {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: 'not-json',
    })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(req, ctx)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Invalid JSON body/)
  })

  it('returns 400 when cosignerId is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({}), ctx)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/cosignerId is required/)
  })

  it('returns 400 when cosignerId is an empty string', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: '   ' }), ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when cosignerId equals the authenticated user id', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'user_1' }), ctx)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/cannot co-sign your own withdrawal/)
  })

  it('returns 400 when note is not a string', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1', note: 123 }), ctx)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/note must be a string/)
  })

  it('returns 400 when note exceeds 500 characters', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1', note: 'x'.repeat(501) }), ctx)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/at most 500 characters/)
  })

  // ── Co-signer existence ─────────────────────────────────────────────────

  it('returns 404 when the co-signer user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockImplementation(async ({ where }: { where: { privyId?: string; id?: string } }) => {
      if (where.privyId) return { id: 'user_1' }
      return null // cosigner not found
    })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'ghost_user' }), ctx)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Co-signer not found')
    expect(withdrawalFindUnique).not.toHaveBeenCalled()
  })

  // ── Withdrawal checks ───────────────────────────────────────────────────

  it('returns 404 when the withdrawal does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Withdrawal not found')
  })

  it('returns 403 when the withdrawal belongs to another user', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindUnique.mockResolvedValue({ ...PENDING_WITHDRAWAL, userId: 'other_user' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/Not authorized/)
    expect(withdrawalUpdate).not.toHaveBeenCalled()
  })

  it('returns 409 when the withdrawal is in a non-cosignable status', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindUnique.mockResolvedValue({ ...PENDING_WITHDRAWAL, status: 'completed', cosignerId: null })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/completed/)
    expect(withdrawalUpdate).not.toHaveBeenCalled()
  })

  it('returns 409 when a co-signer is already set', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindUnique.mockResolvedValue({ ...PENDING_WITHDRAWAL, cosignerId: 'existing_cosigner' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/already been set/)
    expect(withdrawalUpdate).not.toHaveBeenCalled()
  })

  // ── Happy path ──────────────────────────────────────────────────────────

  it('sets the co-signer and returns 200 with the updated withdrawal', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindUnique.mockResolvedValue(PENDING_WITHDRAWAL)
    withdrawalUpdate.mockResolvedValue(UPDATED_WITHDRAWAL)
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.withdrawal.id).toBe('wd_1')
    expect(json.withdrawal.cosignerId).toBe('cosigner_1')
    expect(json.withdrawal.status).toBe('pending')
    expect(json.message).toMatch(/Co-signer requirement has been set/)
    expect(withdrawalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wd_1' },
        data: expect.objectContaining({ cosignerId: 'cosigner_1' }),
      }),
    )
  })

  it('also works for interactive status withdrawals', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindUnique.mockResolvedValue({ ...PENDING_WITHDRAWAL, status: 'interactive' })
    withdrawalUpdate.mockResolvedValue({ ...UPDATED_WITHDRAWAL, status: 'interactive' })
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    expect(res.status).toBe(200)
  })

  it('includes a note in the update when provided', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindUnique.mockResolvedValue(PENDING_WITHDRAWAL)
    withdrawalUpdate.mockResolvedValue(UPDATED_WITHDRAWAL)
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    await POST(makeRequest({ cosignerId: 'cosigner_1', note: 'Large transfer needs approval' }), ctx)
    expect(withdrawalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cosignNote: 'Large transfer needs approval' }),
      }),
    )
  })

  it('omits cosignNote from the update when note is not provided', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalFindUnique.mockResolvedValue(PENDING_WITHDRAWAL)
    withdrawalUpdate.mockResolvedValue(UPDATED_WITHDRAWAL)
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    const callData = withdrawalUpdate.mock.calls[0][0].data
    expect(callData).not.toHaveProperty('cosignNote')
  })

  // ── Error handling ──────────────────────────────────────────────────────

  it('returns 500 on an unexpected database error', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockRejectedValue(new Error('DB crash'))
    const { POST } = await import('@/app/api/routes-d/withdrawals/[id]/require-cosign/route')
    const res = await POST(makeRequest({ cosignerId: 'cosigner_1' }), ctx)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to set co-signer requirement')
    expect(loggerError).toHaveBeenCalled()
  })
})
