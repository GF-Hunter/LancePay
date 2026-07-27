import { NextRequest } from 'next/server'
import { DELETE } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    addressBook: { findFirst: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as {
  addressBook: { findFirst: jest.Mock; delete: jest.Mock }
}

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/routes-d/address-book/${id}`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer tok' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.addressBook.findFirst.mockResolvedValue({ id: 'ab-1', userId: 'user-1', name: 'Alice' })
  db.addressBook.delete.mockResolvedValue({})
})

test('DELETE 401 when unauthenticated', async () => {
  mockVerify.mockResolvedValue(null)
  const res = await DELETE(makeReq('ab-1'), { params: { id: 'ab-1' } })
  expect(res.status).toBe(401)
})

test('DELETE 404 entry not found or not owned', async () => {
  db.addressBook.findFirst.mockResolvedValue(null)
  const res = await DELETE(makeReq('not-mine'), { params: { id: 'not-mine' } })
  expect(res.status).toBe(404)
})

test('DELETE 204 removes entry successfully', async () => {
  const res = await DELETE(makeReq('ab-1'), { params: { id: 'ab-1' } })
  expect(res.status).toBe(204)
  expect(db.addressBook.delete).toHaveBeenCalledWith({ where: { id: 'ab-1' } })
})
