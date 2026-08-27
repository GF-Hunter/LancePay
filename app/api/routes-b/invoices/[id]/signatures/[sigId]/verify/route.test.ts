import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/audit', () => ({ verifySignature: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    auditEvent: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { verifySignature } from '@/lib/audit'
import { prisma } from '@/lib/db'

const params = Promise.resolve({ id: 'inv-1', sigId: 'sig-1' })
const user = { id: 'user-1', privyId: 'privy-1' }
const auditEvent = {
  id: 'sig-1',
  eventType: 'invoice.signature.requested',
  metadata: { note: 'Please sign' },
  signature: 'abc123',
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
}

function makeRequest(token: string | null = 'Bearer token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(
    'http://localhost/api/routes-b/invoices/inv-1/signatures/sig-1/verify',
    { method: 'POST', headers },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: 'privy-1' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never)
  vi.mocked(prisma.invoice.findFirst).mockResolvedValue({ id: 'inv-1' } as never)
  vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue(auditEvent as never)
  vi.mocked(verifySignature).mockReturnValue(true)
})

describe('POST /api/routes-b/invoices/[id]/signatures/[sigId]/verify', () => {
  it('returns valid=true when the signature verifies', async () => {
    const res = await POST(makeRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.valid).toBe(true)
    expect(body.signatureId).toBe('sig-1')
    expect(verifySignature).toHaveBeenCalledWith(
      'inv-1',
      'invoice.signature.requested',
      '2026-08-01T10:00:00.000Z',
      { note: 'Please sign' },
      'abc123',
    )
  })

  it('returns valid=false when the signature does not verify', async () => {
    vi.mocked(verifySignature).mockReturnValue(false)
    const res = await POST(makeRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.valid).toBe(false)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(makeRequest(null), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice is not owned by the user', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the signature record is missing', async () => {
    vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue(null)
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(404)
  })
})
