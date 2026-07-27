import { NextRequest } from 'next/server'
import { GET, PATCH } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    languagePreference: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as {
  languagePreference: { findUnique: jest.Mock; upsert: jest.Mock }
}

const PREFS = { userId: 'user-1', locale: 'en', dateFormat: null, numberFormat: null }

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.languagePreference.findUnique.mockResolvedValue(PREFS)
  db.languagePreference.upsert.mockResolvedValue({ ...PREFS, locale: 'fr' })
})

function makeGetReq() {
  return new NextRequest('http://localhost/api/routes-b/language-preferences', {
    method: 'GET',
    headers: { authorization: 'Bearer tok' },
  })
}

function makePatchReq(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/language-preferences', {
    method: 'PATCH',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/routes-b/language-preferences', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  test('200 returns preferences', async () => {
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    expect((await res.json()).preferences.locale).toBe('en')
  })

  test('200 returns defaults when no record', async () => {
    db.languagePreference.findUnique.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    expect((await res.json()).preferences.locale).toBe('en')
  })
})

describe('PATCH /api/routes-b/language-preferences', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await PATCH(makePatchReq({ locale: 'fr' }))
    expect(res.status).toBe(401)
  })

  test('400 invalid locale', async () => {
    const res = await PATCH(makePatchReq({ locale: 'xx' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/locale/)
  })

  test('400 no fields provided', async () => {
    const res = await PATCH(makePatchReq({}))
    expect(res.status).toBe(400)
  })

  test('200 updates locale', async () => {
    const res = await PATCH(makePatchReq({ locale: 'fr' }))
    expect(res.status).toBe(200)
    expect(db.languagePreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ locale: 'fr' }) }),
    )
  })
})
