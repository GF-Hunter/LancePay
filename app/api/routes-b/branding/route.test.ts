import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    brandingSettings: { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockUpsert = prisma.brandingSettings.upsert as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/branding'

function makeReq(body: unknown, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockUpsert.mockResolvedValue({
    id: 'brand-1',
    logoUrl: 'https://example.com/logo.png',
    primaryColor: '#123456',
    footerText: 'Thanks!',
    signatureUrl: null,
    updatedAt: new Date(),
  })
})

describe('PATCH /api/routes-b/branding', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await PATCH(makeReq({ primaryColor: '#123456' }, null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await PATCH(makeReq({ primaryColor: '#123456' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user is not found', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await PATCH(makeReq({ primaryColor: '#123456' }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await PATCH(makeReq('not-json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when no fields are provided', async () => {
    const res = await PATCH(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid primaryColor', async () => {
    const res = await PATCH(makeReq({ primaryColor: 'not-a-color' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid logoUrl', async () => {
    const res = await PATCH(makeReq({ logoUrl: 'not-a-url' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 and updates branding on the happy path', async () => {
    const res = await PATCH(makeReq({ primaryColor: '#123456', footerText: 'Thanks!' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.branding.primaryColor).toBe('#123456')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('allows clearing footerText with null', async () => {
    mockUpsert.mockResolvedValue({
      id: 'brand-1',
      logoUrl: null,
      primaryColor: '#000000',
      footerText: null,
      signatureUrl: null,
      updatedAt: new Date(),
    })
    const res = await PATCH(makeReq({ footerText: null }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.branding.footerText).toBeNull()
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockUpsert.mockRejectedValue(new Error('db unavailable'))
    const res = await PATCH(makeReq({ primaryColor: '#123456' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to update branding settings')
  })
})
