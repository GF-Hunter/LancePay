import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const digestFindUnique = vi.fn()
const digestUpsert = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    digestEmailSettings: { findUnique: digestFindUnique, upsert: digestUpsert },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/digest-emails'

function req(token: string | null = 'tok', method = 'GET', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/routes-b/digest-emails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userFindUnique.mockResolvedValue({ id: 'user-1' })
  })

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/digest-emails/route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns default settings when none exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    digestFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/digest-emails/route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.settings).toEqual({ enabled: true, frequency: 'weekly', lastSentAt: null })
  })

  it('returns existing settings', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    digestFindUnique.mockResolvedValue({
      id: 'digest-1',
      userId: 'user-1',
      enabled: false,
      frequency: 'monthly',
      lastSentAt: null,
    })
    const { GET } = await import('@/app/api/routes-b/digest-emails/route')
    const res = await GET(req())
    const json = await res.json()
    expect(json.settings.enabled).toBe(false)
    expect(json.settings.frequency).toBe('monthly')
  })
})

describe('POST /api/routes-b/digest-emails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    digestUpsert.mockResolvedValue({
      id: 'digest-1',
      userId: 'user-1',
      enabled: true,
      frequency: 'weekly',
      lastSentAt: null,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-b/digest-emails/route')
    const res = await POST(req(null, 'POST', { frequency: 'daily' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid frequency', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    const { POST } = await import('@/app/api/routes-b/digest-emails/route')
    const res = await POST(req('tok', 'POST', { frequency: 'yearly' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/frequency/)
  })

  it('returns 400 for a non-boolean enabled', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    const { POST } = await import('@/app/api/routes-b/digest-emails/route')
    const res = await POST(req('tok', 'POST', { enabled: 'yes' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/enabled/)
  })

  it('creates settings with defaults when body is empty', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    const { POST } = await import('@/app/api/routes-b/digest-emails/route')
    const res = await POST(req('tok', 'POST', {}))
    expect(res.status).toBe(200)
    expect(digestUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'user-1', enabled: true, frequency: 'weekly' }),
      }),
    )
  })

  it('updates frequency and enabled', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    const { POST } = await import('@/app/api/routes-b/digest-emails/route')
    const res = await POST(req('tok', 'POST', { enabled: false, frequency: 'daily' }))
    expect(res.status).toBe(200)
    expect(digestUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ enabled: false, frequency: 'daily' }),
      }),
    )
  })
})
