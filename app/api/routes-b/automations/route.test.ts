import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    automationRule: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockRule = {
  id: 'rule-1',
  name: 'Notify on payment',
  trigger: 'payment_received',
  action: 'send_notification',
  config: {},
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeGet() {
  return new NextRequest('http://localhost/api/routes-b/automations', {
    headers: { authorization: 'Bearer token' },
  })
}

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/automations', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.automationRule.findMany).mockResolvedValue([mockRule] as never)
  vi.mocked(prisma.automationRule.create).mockResolvedValue(mockRule as never)
})

describe('GET /api/routes-b/automations', () => {
  it('returns list of automation rules', async () => {
    const res = await GET(makeGet())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data.rules)).toBe(true)
    expect(data.rules[0].id).toBe('rule-1')
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/routes-b/automations')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/routes-b/automations', () => {
  it('creates an automation rule', async () => {
    const res = await POST(
      makePost({ name: 'Notify on payment', trigger: 'payment_received', action: 'send_notification' }),
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.rule.id).toBe('rule-1')
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makePost({ trigger: 'payment_received', action: 'send_notification' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid trigger', async () => {
    const res = await POST(makePost({ name: 'x', trigger: 'bogus', action: 'send_notification' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid action', async () => {
    const res = await POST(makePost({ name: 'x', trigger: 'payment_received', action: 'bogus' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/automations', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: '{invalid',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/routes-b/automations', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', trigger: 'payment_received', action: 'send_notification' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
