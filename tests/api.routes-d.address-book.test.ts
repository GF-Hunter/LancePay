import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/routes-d/address-book/route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    contact: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/address-book', {
    headers: { authorization: 'Bearer token' },
  })
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-d/address-book', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
})

describe('GET /api/routes-d/address-book', () => {
  it('returns contacts for authenticated user', async () => {
    const contacts = [{ id: 'c1', name: 'Alice', email: 'a@b.com' }]
    vi.mocked(prisma.contact.findMany).mockResolvedValue(contacts as any)

    const res = await GET(makeGetRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.contacts).toEqual(contacts)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-d/address-book')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/routes-d/address-book', () => {
  it('creates a new contact', async () => {
    const newContact = { id: 'c2', name: 'Bob', email: 'bob@test.com' }
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue(newContact as any)

    const res = await POST(makePostRequest({ name: 'Bob', email: 'bob@test.com' }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.contact).toEqual(newContact)
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makePostRequest({ email: 'bob@test.com' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when email is invalid', async () => {
    const res = await POST(makePostRequest({ name: 'Bob', email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when contact email already exists', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'existing' } as any)

    const res = await POST(makePostRequest({ name: 'Bob', email: 'bob@test.com' }))
    expect(res.status).toBe(409)
  })
})
