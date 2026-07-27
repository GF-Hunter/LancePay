import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/routes-d/admin/sample-data/seed/route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>

const URL = 'http://localhost/api/routes-d/admin/sample-data/seed'

function makeReq(body: unknown = {}, token: string | null = 'Bearer valid-admin-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/routes-d/admin/sample-data/seed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockResolvedValue({ userId: 'privy-admin-1' })
    mockUserFindUnique.mockResolvedValue({ id: 'admin-1', role: 'admin', email: 'admin@lancepay.io' })
  })

  it('returns 401 when missing authorization header', async () => {
    const res = await POST(makeReq({}, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when auth token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 403 when authenticated user is not an admin', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user-2', role: 'freelancer', email: 'user@lancepay.io' })
    const res = await POST(makeReq())
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/admin access required/i)
  })

  it('returns 400 when body JSON is malformed', async () => {
    const res = await POST(makeReq('{ bad json string'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when invalid dataType is provided', async () => {
    const res = await POST(makeReq({ dataType: 'invalid_type' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Invalid dataType/i)
  })

  it('returns 400 when invalid count is provided', async () => {
    const res = await POST(makeReq({ count: 200 }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Invalid count/i)
  })

  it('returns 200 and seeds sample data for admin user (happy path default options)', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.dataType).toBe('all')
    expect(json.seeded.invoices).toBe(5)
    expect(json.seeded.transactions).toBe(5)
    expect(json.seeded.contacts).toBe(5)
  })

  it('returns 200 with specific dataType and count', async () => {
    const res = await POST(makeReq({ dataType: 'invoices', count: 12, cleanExisting: true }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.dataType).toBe('invoices')
    expect(json.seeded.invoices).toBe(12)
    expect(json.seeded.transactions).toBe(0)
    expect(json.cleanExisting).toBe(true)
  })

  it('returns 500 when error occurs during execution', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('Internal database error'))
    const res = await POST(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to seed sample data')
  })
})
