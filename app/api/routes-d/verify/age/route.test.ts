import { NextRequest } from 'next/server'
import { POST } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    ageVerification: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockVerify = verifyAuthToken as jest.Mock

function makeReq(body: unknown, token = 'tok') {
  return new NextRequest('http://localhost/api/routes-d/verify/age', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
  (prisma as unknown as { ageVerification: { upsert: jest.Mock } }).ageVerification.upsert =
    jest.fn().mockResolvedValue({
      id: 'av-1',
      status: 'pending',
      documentType: 'passport',
      createdAt: new Date('2026-01-01'),
    })
})

test('POST 401 when no token', async () => {
  mockVerify.mockResolvedValue(null)
  const res = await POST(makeReq({ dateOfBirth: '1990-01-01', documentType: 'passport', documentNumber: 'AB123' }))
  expect(res.status).toBe(401)
})

test('POST 400 missing dateOfBirth', async () => {
  const res = await POST(makeReq({ documentType: 'passport', documentNumber: 'AB123' }))
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toMatch(/dateOfBirth/)
})

test('POST 400 invalid date', async () => {
  const res = await POST(makeReq({ dateOfBirth: 'not-a-date', documentType: 'passport', documentNumber: 'AB123' }))
  expect(res.status).toBe(400)
})

test('POST 422 underage', async () => {
  const res = await POST(makeReq({ dateOfBirth: '2015-01-01', documentType: 'passport', documentNumber: 'AB123' }))
  expect(res.status).toBe(422)
  const body = await res.json()
  expect(body.error).toMatch(/18/)
})

test('POST 400 invalid documentType', async () => {
  const res = await POST(makeReq({ dateOfBirth: '1990-01-01', documentType: 'selfie', documentNumber: 'AB123' }))
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toMatch(/documentType/)
})

test('POST 400 missing documentNumber', async () => {
  const res = await POST(makeReq({ dateOfBirth: '1990-01-01', documentType: 'passport' }))
  expect(res.status).toBe(400)
})

test('POST 202 success', async () => {
  const res = await POST(makeReq({ dateOfBirth: '1990-06-15', documentType: 'national_id', documentNumber: 'N9999' }))
  expect(res.status).toBe(202)
  const body = await res.json()
  expect(body.status).toBe('pending')
  expect(body.documentType).toBe('passport')
})
