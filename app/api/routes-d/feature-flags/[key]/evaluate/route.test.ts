import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

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

function makeReq(
  key: string,
  body: unknown = {},
  token: string | null = 'Bearer valid-token'
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  const request = new NextRequest(`http://localhost/api/routes-d/feature-flags/${key}/evaluate`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return { request, params: Promise.resolve({ key }) }
}

describe('POST /api/routes-d/feature-flags/[key]/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockResolvedValue({ userId: 'privy-user-456' })
    mockUserFindUnique.mockResolvedValue({ id: 'user-456', email: 'test@example.com', role: 'freelancer' })
  })

  it('returns 401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const { request, params } = makeReq('crypto_payments', {}, null)
    const res = await POST(request, { params })
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when user does not exist', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const { request, params } = makeReq('crypto_payments')
    const res = await POST(request, { params })
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 400 when JSON body is invalid', async () => {
    const { request, params } = makeReq('crypto_payments', '{ invalid-json')
    const res = await POST(request, { params })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('evaluates enabled feature flag with default_enabled reason', async () => {
    const { request, params } = makeReq('crypto_payments')
    const res = await POST(request, { params })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.key).toBe('crypto_payments')
    expect(json.enabled).toBe(true)
    expect(json.reason).toBe('default_enabled')
    expect(json.user.id).toBe('user-456')
  })

  it('evaluates admin role override for beta_analytics', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user-admin', email: 'admin@example.com', role: 'admin' })
    const { request, params } = makeReq('beta_analytics')
    const res = await POST(request, { params })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.key).toBe('beta_analytics')
    expect(json.enabled).toBe(true)
    expect(json.reason).toBe('role_override')
  })

  it('respects defaultEnabled body override with custom_rule reason', async () => {
    const { request, params } = makeReq('unknown_flag', { defaultEnabled: true })
    const res = await POST(request, { params })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.key).toBe('unknown_flag')
    expect(json.enabled).toBe(true)
    expect(json.reason).toBe('custom_rule')
  })

  it('returns 500 when unexpected error occurs', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('Database crash'))
    const { request, params } = makeReq('crypto_payments')
    const res = await POST(request, { params })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to evaluate feature flag')
  })
})
