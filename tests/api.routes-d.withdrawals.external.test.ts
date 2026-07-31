import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const withdrawalCreate = vi.fn()
const loggerError = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/logger', () => ({ logger: { error: loggerError, info: vi.fn() } }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    withdrawalTransaction: { create: withdrawalCreate },
  },
}))

const URL = 'http://localhost/api/routes-d/withdrawals/external'

function makeRequest(body?: unknown, token: string | null = 'token') {
  const headers = new Headers()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/routes-d/withdrawals/external', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when authorization header is missing', async () => {
    const { POST } = await import('@/app/api/routes-d/withdrawals/external/route')
    const response = await POST(makeRequest({ amount: 100, address: 'GXYZ...' }, null))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when amount is non-positive or missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })

    const { POST } = await import('@/app/api/routes-d/withdrawals/external/route')
    const response = await POST(makeRequest({ amount: -50, address: 'GXYZ...' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Amount must be a positive number' })
  })

  it('returns 400 when destination address is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })

    const { POST } = await import('@/app/api/routes-d/withdrawals/external/route')
    const response = await POST(makeRequest({ amount: 100, address: '' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Destination address is required' })
  })

  it('returns 201 on successful withdrawal creation', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    withdrawalCreate.mockResolvedValue({
      id: 'w_123',
      userId: 'user_1',
      amount: 100,
      asset: 'USDC',
      status: 'pending',
      withdrawAddress: 'GXYZ1234567890',
      createdAt: new Date('2026-07-27T00:00:00Z'),
    })

    const { POST } = await import('@/app/api/routes-d/withdrawals/external/route')
    const response = await POST(makeRequest({ amount: 100, address: 'GXYZ1234567890', asset: 'USDC' }))

    expect(response.status).toBe(201)
    const json = await response.json()
    expect(json.message).toBe('External withdrawal initiated successfully')
    expect(json.withdrawal.id).toBe('w_123')
    expect(json.withdrawal.amount).toBe(100)
  })
})
