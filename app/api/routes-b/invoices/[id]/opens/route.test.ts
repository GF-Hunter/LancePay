import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn() },
    auditEvent: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const INVOICE_ID = 'inv-1'
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/opens`

const mockOpen = {
  id: 'open-1',
  actorId: null,
  metadata: { ip: '192.168.1.1', userAgent: 'Mozilla/5.0' },
  createdAt: new Date('2026-08-01'),
}

function callGet(id: string, query = '', token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return GET(new NextRequest(`${BASE_URL}${query}`, { headers }), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: 'privy-1' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never)
  vi.mocked(prisma.invoice.findFirst).mockResolvedValue({ id: INVOICE_ID } as never)
  vi.mocked(prisma.auditEvent.findMany).mockResolvedValue([mockOpen] as never)
  vi.mocked(prisma.auditEvent.count).mockResolvedValue(1 as never)
})

describe('GET /api/routes-b/invoices/[id]/opens', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await callGet(INVOICE_ID, '', null)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the invoice does not exist or is not owned by the user', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(404)
  })

  it('returns 200 with paginated open events on the happy path', async () => {
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.opens).toHaveLength(1)
    expect(json.opens[0].id).toBe('open-1')
    expect(json.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 })
  })

  it('filters audit events to invoice.viewed only', async () => {
    await callGet(INVOICE_ID)
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoiceId: INVOICE_ID, eventType: 'invoice.viewed' },
      }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    vi.mocked(prisma.auditEvent.findMany).mockRejectedValue(new Error('db unavailable'))
    const res = await callGet(INVOICE_ID)
    expect(res.status).toBe(500)
  })
})
