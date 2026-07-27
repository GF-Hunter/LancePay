import { NextRequest } from 'next/server'
import { GET } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    walletSnapshot: { findFirst: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as { walletSnapshot: { findFirst: jest.Mock } }

const SNAP = { id: 'snap-1', label: 'mar', status: 'ready', createdAt: new Date(), data: {} }

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.walletSnapshot.findFirst.mockResolvedValue(SNAP)
})

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/routes-d/wallet/snapshots/${id}`, {
    method: 'GET',
    headers: { authorization: 'Bearer tok' },
  })
}

test('GET 401 when unauthenticated', async () => {
  mockVerify.mockResolvedValue(null)
  const res = await GET(makeReq('snap-1'), { params: { id: 'snap-1' } })
  expect(res.status).toBe(401)
})

test('GET 404 snapshot not found or not owned', async () => {
  db.walletSnapshot.findFirst.mockResolvedValue(null)
  const res = await GET(makeReq('no-snap'), { params: { id: 'no-snap' } })
  expect(res.status).toBe(404)
})

test('GET 200 returns snapshot', async () => {
  const res = await GET(makeReq('snap-1'), { params: { id: 'snap-1' } })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.snapshot.id).toBe('snap-1')
  expect(body.snapshot.status).toBe('ready')
})
