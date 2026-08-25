import { NextRequest } from 'next/server'
import { GET, POST } from './route'

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

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
})

function makeGetReq() {
  return new NextRequest('http://localhost/api/routes-b/search/presets', {
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
  })
}

function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/search/presets', {
    method: 'POST',
    headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET & POST /api/routes-b/search/presets', () => {
  test('401 when unauthenticated on GET', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  test('200 returns presets list', async () => {
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.presets).toBeInstanceOf(Array)
  })

  test('400 missing name or query on POST', async () => {
    const res1 = await POST(makePostReq({ query: 'test' }))
    expect(res1.status).toBe(400)

    const res2 = await POST(makePostReq({ name: 'test' }))
    expect(res2.status).toBe(400)
  })

  test('201 successfully saves a preset', async () => {
    const res = await POST(makePostReq({ name: 'My Invoices', query: 'status:paid' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.preset.name).toBe('My Invoices')
    expect(data.preset.query).toBe('status:paid')
  })
})
