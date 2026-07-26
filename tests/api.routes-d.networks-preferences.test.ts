import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const findUnique = vi.fn()
const prefFindUnique = vi.fn()
const prefUpsert = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    networkPreference: { findUnique: prefFindUnique, upsert: prefUpsert },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/networks/preferences'

function makeGet(withAuth = true) {
  return new NextRequest(BASE_URL, {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

function makePatch(body: unknown, withAuth = true) {
  return new NextRequest(BASE_URL, {
    method: 'PATCH',
    headers: {
      ...(withAuth ? { authorization: 'Bearer token' } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const storedPreferences = {
  id: 'np_1',
  userId: 'user_1',
  defaultNetwork: 'bank',
  stellarNetwork: 'testnet',
  congestionAlerts: false,
  updatedAt: new Date('2026-07-01T00:00:00Z'),
}

describe('GET /api/routes-d/networks/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no authorization header is present', async () => {
    const { GET } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await GET(makeGet(false))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await GET(makeGet())
    expect(res.status).toBe(404)
  })

  it('returns defaults when no preferences are stored', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    prefFindUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const { preferences } = await res.json()
    expect(preferences).toEqual({
      defaultNetwork: 'stellar',
      stellarNetwork: 'public',
      congestionAlerts: true,
      updatedAt: null,
    })
  })

  it('returns stored preferences when they exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    prefFindUnique.mockResolvedValue(storedPreferences)
    const { GET } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const { preferences } = await res.json()
    expect(preferences.defaultNetwork).toBe('bank')
    expect(preferences.stellarNetwork).toBe('testnet')
    expect(preferences.congestionAlerts).toBe(false)
  })
})

describe('PATCH /api/routes-d/networks/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no authorization header is present', async () => {
    const { PATCH } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await PATCH(makePatch({ defaultNetwork: 'stellar' }, false))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid defaultNetwork', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    const { PATCH } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await PATCH(makePatch({ defaultNetwork: 'dogecoin' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid stellarNetwork', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    const { PATCH } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await PATCH(makePatch({ stellarNetwork: 'mainnet-beta' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-boolean congestionAlerts', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    const { PATCH } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await PATCH(makePatch({ congestionAlerts: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when no fields are provided', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    const { PATCH } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await PATCH(makePatch({}))
    expect(res.status).toBe(400)
  })

  it('upserts and returns the updated preferences', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    prefUpsert.mockResolvedValue({
      ...storedPreferences,
      defaultNetwork: 'stellar',
      congestionAlerts: true,
    })
    const { PATCH } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await PATCH(makePatch({ defaultNetwork: 'stellar', congestionAlerts: true }))
    expect(res.status).toBe(200)
    const { preferences } = await res.json()
    expect(preferences.defaultNetwork).toBe('stellar')
    expect(preferences.congestionAlerts).toBe(true)
    expect(prefUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1' },
        update: { defaultNetwork: 'stellar', congestionAlerts: true },
        create: expect.objectContaining({
          userId: 'user_1',
          defaultNetwork: 'stellar',
          congestionAlerts: true,
        }),
      }),
    )
  })

  it('does not touch unsubmitted fields in the update payload', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    prefUpsert.mockResolvedValue(storedPreferences)
    const { PATCH } = await import('@/app/api/routes-d/networks/preferences/route')
    await PATCH(makePatch({ stellarNetwork: 'testnet' }))
    const call = prefUpsert.mock.calls[0][0]
    expect(call.update).toEqual({ stellarNetwork: 'testnet' })
  })

  it('returns 500 when the upsert fails', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue({ id: 'user_1' })
    prefUpsert.mockRejectedValue(new Error('db down'))
    const { PATCH } = await import('@/app/api/routes-d/networks/preferences/route')
    const res = await PATCH(makePatch({ defaultNetwork: 'stellar' }))
    expect(res.status).toBe(500)
  })
})
