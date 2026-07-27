import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    balanceThresholdAlert: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GET, POST } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
const alertDelegate = prisma.balanceThresholdAlert as unknown as {
  findMany: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
}

const BASE_URL = 'http://localhost/api/routes-d/wallet/threshold-alerts'

function makeGet(authHeader: string | null = 'Bearer token') {
  return GET(
    new NextRequest(BASE_URL, {
      method: 'GET',
      headers: authHeader ? { authorization: authHeader } : {},
    }),
  )
}

function makePost(body: unknown, authHeader: string | null = 'Bearer token') {
  return POST(
    new NextRequest(BASE_URL, {
      method: 'POST',
      headers: authHeader
        ? { authorization: authHeader, 'content-type': 'application/json' }
        : { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('wallet/threshold-alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
    alertDelegate.findMany.mockResolvedValue([])
  })

  describe('GET', () => {
    it('returns 401 when no auth header', async () => {
      const res = await makeGet(null)
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('Unauthorized')
    })

    it('returns 401 when token invalid', async () => {
      mockedVerify.mockResolvedValue(null as never)
      const res = await makeGet()
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('Invalid token')
    })

    it('returns 200 with empty alerts list', async () => {
      const res = await makeGet()
      expect(res.status).toBe(200)
      expect((await res.json()).alerts).toEqual([])
    })

    it('scopes list to the authenticated user', async () => {
      await makeGet()
      expect(alertDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      )
    })

    it('serializes threshold decimal to string', async () => {
      alertDelegate.findMany.mockResolvedValue([
        {
          id: 'alert-1',
          currency: 'USD',
          direction: 'below',
          threshold: { toString: () => '100.00' },
          enabled: true,
          lastTriggeredAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ])
      const res = await makeGet()
      const json = await res.json()
      expect(json.alerts[0].threshold).toBe('100.00')
    })

    it('returns 500 when the database throws', async () => {
      alertDelegate.findMany.mockRejectedValue(new Error('db down'))
      const res = await makeGet()
      expect(res.status).toBe(500)
    })
  })

  describe('POST', () => {
    it('returns 401 when no auth header', async () => {
      const res = await makePost({ direction: 'below', threshold: 100 }, null)
      expect(res.status).toBe(401)
    })

    it('returns 401 when token invalid', async () => {
      mockedVerify.mockResolvedValue(null as never)
      const res = await makePost({ direction: 'below', threshold: 100 })
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('Invalid token')
    })

    it('returns 400 for invalid JSON body', async () => {
      const request = new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: '{not json',
      })
      const res = await POST(request)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid JSON body')
    })

    it('returns 400 for invalid currency', async () => {
      const res = await makePost({ currency: 'usdollar1', direction: 'below', threshold: 100 })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('currency must be 2-8 uppercase letters')
    })

    it('returns 400 when direction is missing or invalid', async () => {
      const res = await makePost({ threshold: 100, direction: 'sideways' })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('direction must be one of: below, above')
    })

    it('returns 400 when threshold is not a positive number', async () => {
      const res = await makePost({ direction: 'below', threshold: -5 })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('threshold must be a positive number')
    })

    it('returns 400 when threshold exceeds max', async () => {
      const res = await makePost({ direction: 'below', threshold: 2_000_000_000 })
      expect(res.status).toBe(400)
    })

    it('creates alert with default currency USD when not provided', async () => {
      alertDelegate.create.mockResolvedValue({
        id: 'alert-1',
        currency: 'USD',
        direction: 'below',
        threshold: { toString: () => '100' },
        enabled: true,
        lastTriggeredAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      const res = await makePost({ direction: 'below', threshold: 100 })
      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.alert.currency).toBe('USD')
      expect(alertDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', currency: 'USD', direction: 'below', threshold: 100 }),
        }),
      )
    })

    it('returns 500 when the database throws', async () => {
      alertDelegate.create.mockRejectedValue(new Error('db down'))
      const res = await makePost({ direction: 'above', threshold: 500 })
      expect(res.status).toBe(500)
    })
  })
})
