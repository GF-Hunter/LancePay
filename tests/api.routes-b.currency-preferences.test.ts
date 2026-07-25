import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const userUpdate = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/currency-preferences'

function req(token: string | null = 'tok', method: string = 'GET', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/routes-b/currency-preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 with invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/currency-preferences/route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/currency-preferences/route')
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it('returns currency preferences', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com', timezone: 'UTC' })
    const { GET } = await import('@/app/api/routes-b/currency-preferences/route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.timezone).toBe('UTC')
    expect(json.displayCurrency).toBe('USD')
  })
})

describe('PATCH /api/routes-b/currency-preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 with invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { PATCH } = await import('@/app/api/routes-b/currency-preferences/route')
    const res = await PATCH(req(null, 'PATCH', { timezone: 'PST' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue(null)
    const { PATCH } = await import('@/app/api/routes-b/currency-preferences/route')
    const res = await PATCH(req('tok', 'PATCH', { timezone: 'PST' }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when no fields provided', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { PATCH } = await import('@/app/api/routes-b/currency-preferences/route')
    const res = await PATCH(req('tok', 'PATCH', {}))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid currency', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { PATCH } = await import('@/app/api/routes-b/currency-preferences/route')
    const res = await PATCH(req('tok', 'PATCH', { displayCurrency: 'INVALID' }))
    expect(res.status).toBe(400)
  })

  it('updates timezone successfully', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    userUpdate.mockResolvedValue({ id: 'user-1', email: 'test@example.com', timezone: 'EST' })
    const { PATCH } = await import('@/app/api/routes-b/currency-preferences/route')
    const res = await PATCH(req('tok', 'PATCH', { timezone: 'EST' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.timezone).toBe('EST')
  })
})
