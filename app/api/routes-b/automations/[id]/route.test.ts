import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    automationRule: { findFirst: vi.fn(), update: vi.fn() },
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
const params = { id: 'rule-1' }

function makeGet() {
  return new NextRequest('http://localhost/api/routes-b/automations/rule-1', {
    headers: { authorization: 'Bearer token' },
  })
}

function makePatch(body?: unknown) {
  return new NextRequest('http://localhost/api/routes-b/automations/rule-1', {
    method: 'PATCH',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.automationRule.findFirst).mockResolvedValue(mockRule as never)
  vi.mocked(prisma.automationRule.update).mockResolvedValue({ ...mockRule, isActive: false } as never)
})

describe('GET /api/routes-b/automations/[id]', () => {
  it('returns the automation rule', async () => {
    const res = await GET(makeGet(), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.rule.id).toBe('rule-1')
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/routes-b/automations/rule-1')
    const res = await GET(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when rule does not exist or belongs to another user', async () => {
    vi.mocked(prisma.automationRule.findFirst).mockResolvedValue(null)
    const res = await GET(makeGet(), { params })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/routes-b/automations/[id]', () => {
  it('updates an automation rule', async () => {
    const res = await PATCH(makePatch({ isActive: false }), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.rule.isActive).toBe(false)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/routes-b/automations/rule-1', { method: 'PATCH' })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when rule does not exist or belongs to another user', async () => {
    vi.mocked(prisma.automationRule.findFirst).mockResolvedValue(null)
    const res = await PATCH(makePatch({ isActive: false }), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid trigger', async () => {
    const res = await PATCH(makePatch({ trigger: 'bogus' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid action', async () => {
    const res = await PATCH(makePatch({ action: 'bogus' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when no valid fields are provided', async () => {
    const res = await PATCH(makePatch({}), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/automations/rule-1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: '{invalid',
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(400)
  })
})
