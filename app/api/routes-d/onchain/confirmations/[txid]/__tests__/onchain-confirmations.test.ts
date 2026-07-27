import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    transaction: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GET } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
const txDelegate = prisma.transaction as unknown as { findFirst: ReturnType<typeof vi.fn> }
const BASE_URL = 'http://localhost/api/routes-d/onchain/confirmations'

function makeGet(txid: string, authHeader: string | null = 'Bearer token') {
  const request = new NextRequest(`${BASE_URL}/${txid}`, {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  })
  return GET(request, { params: { txid } })
}

describe('GET /api/routes-d/onchain/confirmations/[txid]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:10:00.000Z'))
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 401 when no auth header', async () => {
    const res = await makeGet('0xabc', null)
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await makeGet('0xabc')
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await makeGet('0xabc')
    expect(res.status).toBe(404)
  })

  it('returns 404 when transaction not found', async () => {
    txDelegate.findFirst.mockResolvedValue(null)
    const res = await makeGet('0xabc')
    expect(res.status).toBe(404)
  })

  it('returns 403 when transaction belongs to another user', async () => {
    txDelegate.findFirst.mockResolvedValue({ userId: 'other-user', status: 'pending', createdAt: new Date() })
    const res = await makeGet('0xabc')
    expect(res.status).toBe(403)
  })

  it('returns full confirmations when status is completed', async () => {
    txDelegate.findFirst.mockResolvedValue({ userId: 'user-1', status: 'completed', createdAt: new Date('2026-01-01T00:00:00.000Z') })
    const res = await makeGet('0xabc')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.confirmation.confirmations).toBe(12)
    expect(body.confirmation.confirmed).toBe(true)
  })

  it('returns zero confirmations when status is failed', async () => {
    txDelegate.findFirst.mockResolvedValue({ userId: 'user-1', status: 'failed', createdAt: new Date('2026-01-01T00:00:00.000Z') })
    const res = await makeGet('0xabc')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.confirmation.confirmations).toBe(0)
    expect(body.confirmation.confirmed).toBe(false)
  })

  it('returns time-based confirmations when status is pending', async () => {
    txDelegate.findFirst.mockResolvedValue({ userId: 'user-1', status: 'pending', createdAt: new Date('2026-01-01T00:00:00.000Z') })
    const res = await makeGet('0xabc')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.confirmation.confirmations).toBe(10)
    expect(body.confirmation.confirmed).toBe(false)
    expect(body.confirmation.requiredConfirmations).toBe(12)
  })
})
