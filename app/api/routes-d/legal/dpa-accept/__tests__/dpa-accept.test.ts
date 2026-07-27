import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { POST } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
const BASE_URL = 'http://localhost/api/routes-d/legal/dpa-accept'

function makePost(body: unknown = {}, authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: authHeader
      ? { authorization: authHeader, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/routes-d/legal/dpa-accept', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
    userDelegate.update.mockResolvedValue({ id: 'user-1' })
  })

  it('returns 401 when no auth header', async () => {
    const res = await POST(makePost({}, null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await POST(makePost())
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await POST(makePost())
    expect(res.status).toBe(404)
  })

  it('returns 400 when version is not a string', async () => {
    const res = await POST(makePost({ version: 123 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('version must be a string')
  })

  it('returns 200 with default version when body is empty', async () => {
    const res = await POST(makePost())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dpa.accepted).toBe(true)
    expect(body.dpa.version).toBe('1.0')
    expect(body.dpa.acceptedAt).toBeDefined()
  })

  it('returns 200 with provided version', async () => {
    const res = await POST(makePost({ version: '2.1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dpa.version).toBe('2.1')
  })

  it('calls prisma.user.update with dpaAccepted true', async () => {
    await POST(makePost())
    const updateCall = userDelegate.update.mock.calls[0][0]
    expect(updateCall.data.dpaAccepted).toBe(true)
    expect(updateCall.data.dpaAcceptedAt).toBeInstanceOf(Date)
  })
})
