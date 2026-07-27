import { NextRequest } from 'next/server'
import { GET } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), count: jest.fn() },
    transaction: { count: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock

function makeReq() {
  return new NextRequest('http://localhost/api/routes-d/metrics/prometheus', {
    method: 'GET',
    headers: { authorization: 'Bearer tok' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'admin' });
  (prisma.user.count as jest.Mock).mockResolvedValue(42);
  (prisma.transaction.count as jest.Mock).mockResolvedValue(100)
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

test('GET 200 returns prometheus text format', async () => {
  const res = await GET(makeReq())
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/plain')
  const text = await res.text()
  expect(text).toContain('lancepay_users_total 42')
  expect(text).toContain('lancepay_transactions_total 100')
  expect(text).toContain('# TYPE lancepay_users_total gauge')
})
