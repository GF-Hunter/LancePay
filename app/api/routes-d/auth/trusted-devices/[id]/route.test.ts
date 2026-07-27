import { NextRequest } from 'next/server'
import { DELETE } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    trustedDevice: { findFirst: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as {
  trustedDevice: { findFirst: jest.Mock; delete: jest.Mock }
}

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/routes-d/auth/trusted-devices/${id}`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer tok' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.trustedDevice.findFirst.mockResolvedValue({ id: 'dev-1', userId: 'user-1', name: 'iPhone' })
  db.trustedDevice.delete.mockResolvedValue({})
})

test('DELETE 401 when unauthenticated', async () => {
  mockVerify.mockResolvedValue(null)
  const res = await DELETE(makeReq('dev-1'), { params: { id: 'dev-1' } })
  expect(res.status).toBe(401)
})

test('DELETE 404 device not found or not owned', async () => {
  db.trustedDevice.findFirst.mockResolvedValue(null)
  const res = await DELETE(makeReq('other'), { params: { id: 'other' } })
  expect(res.status).toBe(404)
})

test('DELETE 204 revokes device', async () => {
  const res = await DELETE(makeReq('dev-1'), { params: { id: 'dev-1' } })
  expect(res.status).toBe(204)
  expect(db.trustedDevice.delete).toHaveBeenCalledWith({ where: { id: 'dev-1' } })
})
