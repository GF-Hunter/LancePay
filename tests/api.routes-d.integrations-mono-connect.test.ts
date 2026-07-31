import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-d/integrations/mono/connect'

function makeReq(body: unknown = {}, token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/routes-d/integrations/mono/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthToken.mockResolvedValue({ userId: 'privy-user-123' })
    userFindUnique.mockResolvedValue({ id: 'user-123', email: 'test@lancepay.io' })
  })

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/integrations/mono/connect/route')
    const res = await POST(makeReq({}, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when user is not found', async () => {
    userFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/integrations/mono/connect/route')
    const res = await POST(makeReq({ code: 'auth_code_123' }))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 400 when body JSON is invalid', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/mono/connect/route')
    const res = await POST(makeReq('invalid json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when code is missing', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/mono/connect/route')
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Authorization code is required/i)
  })

  it('returns 200 with connection details on success', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/mono/connect/route')
    const res = await POST(makeReq({ code: 'mono_auth_code_xyz', monoAccountId: 'mono_acc_123' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.connected).toBe(true)
    expect(json.userId).toBe('user-123')
    expect(json.monoAccountId).toBe('mono_acc_123')
    expect(json.status).toBe('active')
    expect(json.connectedAt).toBeDefined()
  })

  it('returns 500 when server throws unexpected error', async () => {
    userFindUnique.mockRejectedValue(new Error('Uncaught database failure'))
    const { POST } = await import('@/app/api/routes-d/integrations/mono/connect/route')
    const res = await POST(makeReq({ code: 'auth_code_123' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to connect Mono account')
  })
})
