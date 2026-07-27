import { NextRequest } from 'next/server'
import { GET, POST } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    chargeback: { findMany: jest.fn(), create: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as {
  chargeback: { findMany: jest.Mock; create: jest.Mock }
}

const CHARGEBACKS = [{ id: 'cb-1', transactionId: 'tx-99', reason: 'unauthorized', status: 'pending', createdAt: new Date() }]
const NEW_CB = { id: 'cb-2', transactionId: 'tx-100', reason: 'duplicate', status: 'pending', createdAt: new Date() }

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.chargeback.findMany.mockResolvedValue(CHARGEBACKS)
  db.chargeback.create.mockResolvedValue(NEW_CB)
})

function makeGetReq() {
  return new NextRequest('http://localhost/api/routes-d/chargebacks', {
    method: 'GET',
    headers: { authorization: 'Bearer tok' },
  })
}

function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/routes-d/chargebacks', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/routes-d/chargebacks', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  test('200 returns chargebacks list', async () => {
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.chargebacks).toHaveLength(1)
    expect(body.chargebacks[0].reason).toBe('unauthorized')
  })
})

describe('POST /api/routes-d/chargebacks', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await POST(makePostReq({ transactionId: 'tx-1', reason: 'unauthorized' }))
    expect(res.status).toBe(401)
  })

  test('400 missing transactionId', async () => {
    const res = await POST(makePostReq({ reason: 'unauthorized' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/transactionId/)
  })

  test('400 missing reason', async () => {
    const res = await POST(makePostReq({ transactionId: 'tx-1' }))
    expect(res.status).toBe(400)
  })

  test('400 invalid reason', async () => {
    const res = await POST(makePostReq({ transactionId: 'tx-1', reason: 'random' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/reason/)
  })

  test('201 files chargeback', async () => {
    const res = await POST(makePostReq({ transactionId: 'tx-100', reason: 'duplicate' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.chargeback.status).toBe('pending')
    expect(db.chargeback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'duplicate', status: 'pending' }) }),
    )
  })
})
