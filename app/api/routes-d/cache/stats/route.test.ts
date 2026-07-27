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

function makeReq() {
  return new NextRequest('http://localhost/api/routes-d/cache/stats', {
    method: 'GET',
    headers: { authorization: 'Bearer tok' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'admin' })
})

test('GET 401 when unauthenticated', async () => {
  mockVerify.mockResolvedValue(null)
  const res = await GET(makeReq())
  expect(res.status).toBe(401)
})

test('GET 403 when not admin', async () => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'user' })
  const res = await GET(makeReq())
  expect(res.status).toBe(403)
})

test('GET 404 when user not found', async () => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
  const res = await GET(makeReq())
  expect(res.status).toBe(404)
})

test('GET 200 returns cache stats shape', async () => {
  const res = await GET(makeReq())
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.stats).toMatchObject({
    hits: expect.any(Number),
    misses: expect.any(Number),
    hitRate: expect.any(Number),
    totalEntries: expect.any(Number),
    memoryUsageBytes: expect.any(Number),
    uptimeSeconds: expect.any(Number),
  })
})

test('GET 500 on unexpected error', async () => {
  (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('db down'))
  const res = await GET(makeReq())
  expect(res.status).toBe(500)
})
