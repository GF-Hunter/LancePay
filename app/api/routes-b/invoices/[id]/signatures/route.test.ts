import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    auditEvent: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/audit', () => ({
  extractRequestMetadata: vi.fn(() => ({ ip: '127.0.0.1', userAgent: 'vitest' })),
  logAuditEvent: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'

const INVOICE_ID = 'inv-1'
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/signatures`

const mockSignature = {
  id: 'sig-1',
  eventType: 'invoice.signature.requested',
  actorId: 'user-1',
  metadata: { note: 'Please sign' },
  signature: 'abc123',
  createdAt: new Date('2026-08-01'),
}

function callGet(id: string, query = '', token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return GET(new NextRequest(`${BASE_URL}${query}`, { headers }), {
    params: Promise.resolve({ id }),
  })
}

function callPost(id: string, body: unknown, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return POST(
    new NextRequest(BASE_URL, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: 'privy-1' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never)
  vi.mocked(prisma.invoice.findFirst).mockResolvedValue({ id: INVOICE_ID } as never)
  vi.mocked(prisma.auditEvent.findMany).mockResolvedValue([mockSignature] as never)
  vi.mocked(prisma.auditEvent.count).mockResolvedValue(1 as never)
  vi.mocked(logAuditEvent).mockResolvedValue(mockSignature as never)
})

describe('GET /api/routes-b/invoices/[id]/signatures', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callGet(INVOICE_ID, '', null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice is not owned by the user', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(404)
  })

  it('returns 200 with paginated signature events', async () => {
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.signatures).toHaveLength(1)
    expect(json.signatures[0].signature).toBe('abc123')
  })

  it('filters to invoice.signature event types', async () => {
    await callGet(INVOICE_ID)
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoiceId: INVOICE_ID, eventType: { startsWith: 'invoice.signature' } },
      }),
    )
  })
})

describe('POST /api/routes-b/invoices/[id]/signatures', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callPost(INVOICE_ID, { note: 'Please sign' }, null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice is not owned by the user', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await callPost(INVOICE_ID, { note: 'Please sign' })
    expect(res.status).toBe(404)
  })

  it('returns 201 and creates a signature request audit event', async () => {
    const res = await callPost(INVOICE_ID, { note: 'Please sign' })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.signature.id).toBe('sig-1')
    expect(logAuditEvent).toHaveBeenCalledWith(
      INVOICE_ID,
      'invoice.signature.requested',
      'user-1',
      expect.objectContaining({ note: 'Please sign' }),
    )
  })

  it('returns 400 when note is not a string', async () => {
    const res = await callPost(INVOICE_ID, { note: 123 })
    expect(res.status).toBe(400)
  })
})
