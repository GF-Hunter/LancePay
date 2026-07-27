import { NextRequest } from 'next/server'
import { GET, POST } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    ipAllowlist: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as {
  ipAllowlist: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock }
}

function makeGetReq() {
  return new NextRequest('http://localhost/api/routes-d/ip-allowlist', {
    method: 'GET',
    headers: { authorization: 'Bearer tok' },
  })
}

function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/routes-d/ip-allowlist', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const SAMPLE_ENTRIES = [
  { id: 'e1', ipAddress: '192.168.1.1', label: 'office', createdAt: new Date() },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.ipAllowlist.findMany.mockResolvedValue(SAMPLE_ENTRIES)
  db.ipAllowlist.findFirst.mockResolvedValue(null)
  db.ipAllowlist.create.mockResolvedValue({ id: 'e2', ipAddress: '10.0.0.1', label: null, createdAt: new Date() })
})

describe('GET /api/routes-d/ip-allowlist', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  test('200 returns entries list', async () => {
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.entries)).toBe(true)
    expect(body.entries).toHaveLength(1)
    expect(body.entries[0].ipAddress).toBe('192.168.1.1')
  })
})

describe('POST /api/routes-d/ip-allowlist', () => {
  test('401 when unauthenticated', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await POST(makePostReq({ ipAddress: '10.0.0.1' }))
    expect(res.status).toBe(401)
  })

  test('400 missing ipAddress', async () => {
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ipAddress/)
  })

  test('400 invalid IP format', async () => {
    const res = await POST(makePostReq({ ipAddress: 'not-an-ip!!!' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/valid/)
  })

  test('409 duplicate IP', async () => {
    db.ipAllowlist.findFirst.mockResolvedValue({ id: 'existing', ipAddress: '10.0.0.1' })
    const res = await POST(makePostReq({ ipAddress: '10.0.0.1' }))
    expect(res.status).toBe(409)
  })

  test('201 adds new IP', async () => {
    const res = await POST(makePostReq({ ipAddress: '10.0.0.1', label: 'home' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.entry.ipAddress).toBe('10.0.0.1')
  })
})
