import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    smsTemplate: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockSmsTemplate = {
  id: 'sms-1',
  name: 'Payment SMS',
  body: 'Hello {{recipientName}}, invoice {{invoiceNumber}} of {{amount}} is due.',
  userId: 'user-1',
}

function makeGet(id: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/routes-b/sms-templates/${id}/preview`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url, { headers: { authorization: 'Bearer token' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  const delegate = (prisma as unknown as { smsTemplate: { findFirst: ReturnType<typeof vi.fn> } }).smsTemplate
  if (delegate) {
    vi.mocked(delegate.findFirst).mockResolvedValue(mockSmsTemplate as never)
  }
})

describe('GET /api/routes-b/sms-templates/[id]/preview', () => {
  it('previews template with replaced variables', async () => {
    const req = makeGet('sms-1', { recipientName: 'Alice', amount: '$50.00', invoiceNumber: 'INV-200' })
    const res = await GET(req, { params: Promise.resolve({ id: 'sms-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.templateId).toBe('sms-1')
    expect(data.previewText).toContain('Hello Alice')
    expect(data.previewText).toContain('$50.00')
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/sms-templates/sms-1/preview')
    const res = await GET(req, { params: Promise.resolve({ id: 'sms-1' }) })
    expect(res.status).toBe(401)
  })
})
