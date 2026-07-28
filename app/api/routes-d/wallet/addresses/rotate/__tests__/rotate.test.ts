import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    wallet: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { POST } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
const walletDelegate = prisma.wallet as unknown as {
  findUnique: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const BASE_URL = 'http://localhost/api/routes-d/wallet/addresses/rotate'
const OLD_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

function makePost(authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('POST /api/routes-d/wallet/addresses/rotate', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when no auth header is sent', async () => {
    const res = await POST(makePost(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await POST(makePost())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await POST(makePost())
    expect(res.status).toBe(404)
  })

  it('returns 404 when the user has no wallet', async () => {
    mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
    walletDelegate.findUnique.mockResolvedValue(null)
    const res = await POST(makePost())
    expect(res.status).toBe(404)
  })

  it('rotates the address and masks the previous one', async () => {
    mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
    walletDelegate.findUnique.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      address: OLD_ADDRESS,
    })
    walletDelegate.update.mockImplementation(async ({ data }: { data: { address: string } }) => ({
      id: 'wallet-1',
      userId: 'user-1',
      address: data.address,
    }))

    const res = await POST(makePost())
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.address).toMatch(/^G[A-Z2-7]{55}$/)
    expect(body.address).not.toBe(OLD_ADDRESS)
    expect(body.previous_address).toBe('GAAA...AAAA')
    expect(Number.isNaN(Date.parse(body.rotated_at))).toBe(false)

    expect(walletDelegate.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { address: body.address },
    })
  })

  it('returns 500 when the database update fails', async () => {
    mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
    walletDelegate.findUnique.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      address: OLD_ADDRESS,
    })
    walletDelegate.update.mockRejectedValue(new Error('db down'))

    const res = await POST(makePost())
    expect(res.status).toBe(500)
  })
})
