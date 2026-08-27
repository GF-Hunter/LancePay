import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    smsTemplate: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockExistingTemplate = {
  id: 'sms-1',
  name: 'Old Name',
  body: 'Old Body',
  userId: 'user-1',
}

function makePatch(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/routes-b/sms-templates/${id}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  const delegate = (prisma as unknown as { smsTemplate: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } }).smsTemplate
  if (delegate) {
    vi.mocked(delegate.findFirst).mockResolvedValue(mockExistingTemplate as never)
    vi.mocked(delegate.update).mockResolvedValue({ ...mockExistingTemplate, name: 'New Name' } as never)
  }
})

describe('PATCH /api/routes-b/sms-templates/[id]', () => {
  it('updates SMS template successfully', async () => {
    const req = makePatch('sms-1', { name: 'New Name' })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'sms-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.name).toBe('New Name')
  })

  it('returns 400 when no fields provided', async () => {
    const req = makePatch('sms-1', {})
    const res = await PATCH(req, { params: Promise.resolve({ id: 'sms-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/sms-templates/sms-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'sms-1' }) })
    expect(res.status).toBe(401)
  })
})
