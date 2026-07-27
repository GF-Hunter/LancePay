import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/routes-d/integrations/chainalysis/screen/route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    securityWatchlist: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockWatchlistFindUnique = (prisma as unknown as { securityWatchlist: { findUnique: ReturnType<typeof vi.fn> } }).securityWatchlist.findUnique

const URL = 'http://localhost/api/routes-d/integrations/chainalysis/screen'

function makeReq(body: unknown = {}, token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/routes-d/integrations/chainalysis/screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockResolvedValue({ userId: 'privy-user-789' })
    mockUserFindUnique.mockResolvedValue({ id: 'user-789', email: 'trader@lancepay.io' })
    mockWatchlistFindUnique.mockResolvedValue(null)
  })

  it('returns 401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await POST(makeReq({}, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when user is not found', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await POST(makeReq({ address: '0x1234567890abcdef' }))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 400 when body JSON is invalid', async () => {
    const res = await POST(makeReq('invalid json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when address is missing or too short', async () => {
    const res = await POST(makeReq({ address: '0x123' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Valid crypto address is required/i)
  })

  it('returns 200 with low risk status for a clean address (happy path)', async () => {
    const validAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    const res = await POST(makeReq({ address: validAddress, asset: 'USDC', network: 'ethereum' }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.address).toBe(validAddress)
    expect(json.asset).toBe('USDC')
    expect(json.network).toBe('ethereum')
    expect(json.riskLevel).toBe('low')
    expect(json.status).toBe('cleared')
    expect(json.indicators).toHaveLength(0)
  })

  it('flags sanctioned address from security watchlist', async () => {
    const sanctionedAddress = '0x7F3670359f478a071545d93bc4F41e6e00b86aE4'
    mockWatchlistFindUnique.mockResolvedValue({ value: sanctionedAddress, reason: 'OFAC Sanctioned Entity' })

    const res = await POST(makeReq({ address: sanctionedAddress }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.address).toBe(sanctionedAddress)
    expect(json.riskLevel).toBe('sanctioned')
    expect(json.status).toBe('blocked')
    expect(json.indicators).toContain('security_watchlist_match')
  })

  it('returns 500 when server throws unexpected error', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('Uncaught database failure'))
    const res = await POST(makeReq({ address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to perform address screening')
  })
})
