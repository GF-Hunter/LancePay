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
  return new NextRequest('http://localhost/api/routes-b/search/history', {
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
  })
}

function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/search/history', {
    method: 'POST',
    headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET & POST /api/routes-b/search/history', () => {
  test('401 when unauthenticated on GET', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  test('200 returns search history', async () => {
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.history).toBeInstanceOf(Array)
  })

  test('400 missing query on POST', async () => {
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/query/)
  })

  test('201 records search query', async () => {
    const res = await POST(makePostReq({ query: 'smart contract audit', source: 'contracts' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.item.query).toBe('smart contract audit')
    expect(data.item.source).toBe('contracts')
  })
})
