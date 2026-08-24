import { NextRequest } from 'next/server'
import { GET } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
})

function makeGetReq(query?: string) {
  const url = query ? `http://localhost/api/routes-b/command-palette?q=${query}` : 'http://localhost/api/routes-b/command-palette'
  return new NextRequest(url, {
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
  })
}

describe('GET /api/routes-b/command-palette', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  test('200 returns command palette actions', async () => {
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.suggestions.length).toBeGreaterThan(0)
    expect(data.total).toBe(data.suggestions.length)
  })

  test('filters results by search query', async () => {
    const res = await GET(makeGetReq('invoice'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.suggestions.length).toBeGreaterThanOrEqual(1)
    expect(data.suggestions[0].title).toContain('Invoice')
  })
})
