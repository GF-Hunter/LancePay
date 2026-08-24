import { NextRequest } from 'next/server'
import { GET } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    invoice: { findMany: jest.fn() },
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

function makeGetReq() {
  return new NextRequest('http://localhost/api/routes-b/analytics/revenue-by-category', {
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
  })
}

describe('GET /api/routes-b/analytics/revenue-by-category', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  test('200 returns revenue breakdown by category', async () => {
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.categories).toBeInstanceOf(Array)
    expect(data.categories.length).toBeGreaterThan(0)
    expect(data.totalRevenue).toBeGreaterThan(0)
  })
})
