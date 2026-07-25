import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const userSSOConfigFindUnique = vi.fn()
const userSSOConfigUpdate = vi.fn()
const userSSOConfigCreate = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    userSSOConfiguration: {
      findUnique: userSSOConfigFindUnique,
      update: userSSOConfigUpdate,
      create: userSSOConfigCreate,
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/sso/configuration'

function makeRequest(body?: unknown, method: string = 'GET', auth: string | null = 'Bearer token') {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (auth) headers.set('authorization', `Bearer ${auth}`)
  return new NextRequest(BASE_URL, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/routes-d/sso/configuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const { GET } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await GET(makeRequest(undefined, 'GET', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await GET(makeRequest(undefined, 'GET'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await GET(makeRequest(undefined, 'GET'))
    expect(res.status).toBe(404)
  })

  it('returns null when no SSO configuration exists', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    userSSOConfigFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await GET(makeRequest(undefined, 'GET'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.configuration).toBeNull()
  })

  it('returns existing SSO configuration', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const configDate = new Date('2025-01-10')
    userSSOConfigFindUnique.mockResolvedValue({
      id: 'sso_1',
      userId: 'user_1',
      provider: 'google',
      isEnabled: true,
      clientId: 'client_123',
      clientSecret: 'secret_123',
      callbackUrl: 'https://example.com/callback',
      updatedAt: configDate,
    })
    const { GET } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await GET(makeRequest(undefined, 'GET'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.configuration).toEqual({
      id: 'sso_1',
      provider: 'google',
      isEnabled: true,
      callbackUrl: 'https://example.com/callback',
      configuredAt: configDate,
    })
  })

  it('returns 500 when the database lookup fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    userSSOConfigFindUnique.mockRejectedValue(new Error('db error'))
    const { GET } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await GET(makeRequest(undefined, 'GET'))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/routes-d/sso/configuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await POST(
      makeRequest({ provider: 'google', clientId: 'id', clientSecret: 'secret', callbackUrl: 'https://example.com' }, 'POST', null),
    )
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await POST(
      makeRequest({ provider: 'google', clientId: 'id', clientSecret: 'secret', callbackUrl: 'https://example.com' }, 'POST'),
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await POST(
      makeRequest({ provider: 'google', clientId: 'id', clientSecret: 'secret', callbackUrl: 'https://example.com' }, 'POST'),
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when provider is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await POST(
      makeRequest({ clientId: 'id', clientSecret: 'secret', callbackUrl: 'https://example.com' }, 'POST'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('provider')
  })

  it('returns 400 when clientId is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { POST } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await POST(
      makeRequest({ provider: 'google', clientSecret: 'secret', callbackUrl: 'https://example.com' }, 'POST'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('clientId')
  })

  it('creates new SSO configuration', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    userSSOConfigFindUnique.mockResolvedValue(null)
    const configDate = new Date()
    userSSOConfigCreate.mockResolvedValue({
      id: 'sso_1',
      userId: 'user_1',
      provider: 'google',
      isEnabled: true,
      clientId: 'id_123',
      clientSecret: 'secret_123',
      callbackUrl: 'https://example.com/callback',
      updatedAt: configDate,
    })
    const { POST } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await POST(
      makeRequest(
        { provider: 'google', clientId: 'id_123', clientSecret: 'secret_123', callbackUrl: 'https://example.com/callback' },
        'POST',
      ),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.configuration.id).toBe('sso_1')
  })

  it('updates existing SSO configuration', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    userSSOConfigFindUnique.mockResolvedValue({ id: 'sso_1' })
    const configDate = new Date()
    userSSOConfigUpdate.mockResolvedValue({
      id: 'sso_1',
      userId: 'user_1',
      provider: 'github',
      isEnabled: true,
      clientId: 'id_456',
      clientSecret: 'secret_456',
      callbackUrl: 'https://example.com/callback',
      updatedAt: configDate,
    })
    const { POST } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await POST(
      makeRequest(
        { provider: 'github', clientId: 'id_456', clientSecret: 'secret_456', callbackUrl: 'https://example.com/callback' },
        'POST',
      ),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.configuration.provider).toBe('github')
  })

  it('returns 500 when the database operation fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    userSSOConfigFindUnique.mockResolvedValue(null)
    userSSOConfigCreate.mockRejectedValue(new Error('db error'))
    const { POST } = await import('@/app/api/routes-d/sso/configuration/route')
    const res = await POST(
      makeRequest(
        { provider: 'google', clientId: 'id_123', clientSecret: 'secret_123', callbackUrl: 'https://example.com/callback' },
        'POST',
      ),
    )
    expect(res.status).toBe(500)
  })
})
