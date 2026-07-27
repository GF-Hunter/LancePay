import { NextRequest } from 'next/server'
import { GET } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    chargeback: { findFirst: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as { chargeback: { findFirst: jest.Mock } }

const CB = { id: 'cb-1', transactionId: 'tx-99', reason: 'unauthorized', status: 'under_review', createdAt: new Date() }

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.chargeback.findFirst.mockResolvedValue(CB)
})

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/routes-d/chargebacks/${id}`, {
    method: 'GET',
    headers: { authorization: 'Bearer tok' },
  })
}

test('GET 401 when unauthenticated', async () => {
  mockVerify.mockResolvedValue(null)
  const res = await GET(makeReq('cb-1'), { params: { id: 'cb-1' } })
  expect(res.status).toBe(401)
})

test('GET 404 chargeback not found or not owned', async () => {
  db.chargeback.findFirst.mockResolvedValue(null)
  const res = await GET(makeReq('other'), { params: { id: 'other' } })
  expect(res.status).toBe(404)
})

test('GET 200 returns chargeback', async () => {
  const res = await GET(makeReq('cb-1'), { params: { id: 'cb-1' } })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.chargeback.id).toBe('cb-1')
  expect(body.chargeback.reason).toBe('unauthorized')
})
