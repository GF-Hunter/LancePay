import { NextRequest } from 'next/server'
import { GET, POST } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    walletSnapshot: { findMany: jest.fn(), create: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as {
  walletSnapshot: { findMany: jest.Mock; create: jest.Mock }
}

const SNAPSHOTS = [{ id: 'snap-1', label: 'jan', status: 'ready', createdAt: new Date() }]
const NEW_SNAP = { id: 'snap-2', label: null, status: 'pending', createdAt: new Date() }

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.walletSnapshot.findMany.mockResolvedValue(SNAPSHOTS)
  db.walletSnapshot.create.mockResolvedValue(NEW_SNAP)
})

function makeGetReq() {
  return new NextRequest('http://localhost/api/routes-d/wallet/snapshots', {
    method: 'GET',
    headers: { authorization: 'Bearer tok' },
  })
}

function makePostReq(body: unknown = {}) {
  return new NextRequest('http://localhost/api/routes-d/wallet/snapshots', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/routes-d/wallet/snapshots', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  test('200 returns snapshots', async () => {
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.snapshots).toHaveLength(1)
    expect(body.snapshots[0].id).toBe('snap-1')
  })
})

describe('POST /api/routes-d/wallet/snapshots', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await POST(makePostReq())
    expect(res.status).toBe(401)
  })

  test('201 creates snapshot', async () => {
    const res = await POST(makePostReq({ label: 'weekly' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.snapshot.status).toBe('pending')
    expect(db.walletSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending', userId: 'user-1' }) }),
    )
  })
})
