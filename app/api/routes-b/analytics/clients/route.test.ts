import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    client: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }

const mockClients = [
  { id: 'client-1', name: 'Acme Corp', email: 'contact@acme.com', createdAt: new Date() },
  { id: 'client-2', name: 'TechStart', email: 'hello@techstart.com', createdAt: new Date() },
]

const mockInvoicesClient1 = [
  {
    id: 'inv-1',
    amount: 1000,
    status: 'paid',
    dueDate: new Date(),
    createdAt: new Date(),
  },
  {
    id: 'inv-2',
    amount: 500,
    status: 'pending',
    dueDate: new Date(),
    createdAt: new Date(),
  },
]

const mockInvoicesClient2 = [
  {
    id: 'inv-3',
    amount: 2000,
    status: 'paid',
    dueDate: new Date(),
    createdAt: new Date(),
  },
]

function makeGet() {
  return new NextRequest('http://localhost/api/routes-b/analytics/clients', {
    headers: { authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
})

describe('GET /api/routes-b/analytics/clients', () => {
  it('returns client revenue analytics for authenticated user', async () => {
    vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as never)
    vi.mocked(prisma.invoice.findMany)
      .mockResolvedValueOnce(mockInvoicesClient1 as never)
      .mockResolvedValueOnce(mockInvoicesClient2 as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(Array.isArray(data.clients)).toBe(true)
    expect(data.clients.length).toBe(2)
    expect(data.clients[0].clientName).toBe('TechStart') // Sorted by revenue
    expect(data.clients[0].totalRevenue).toBe(2000)
    expect(data.clients[1].clientName).toBe('Acme Corp')
    expect(data.clients[1].totalRevenue).toBe(1500)
    expect(data.clients[1].paidRevenue).toBe(1000)
    expect(data.clients[1].outstandingRevenue).toBe(500)
  })

  it('returns 401 when no auth token provided', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/analytics/clients')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 401 when token is invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Invalid token')
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('User not found')
  })

  it('returns empty array when user has no clients', async () => {
    vi.mocked(prisma.client.findMany).mockResolvedValue([])
    const res = await GET(makeGet())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.clients.length).toBe(0)
  })

  it('excludes cancelled invoices from revenue calculation', async () => {
    const invoicesWithCancelled = [
      {
        id: 'inv-1',
        amount: 1000,
        status: 'paid',
        dueDate: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'inv-2',
        amount: 500,
        status: 'cancelled',
        dueDate: new Date(),
        createdAt: new Date(),
      },
    ]

    vi.mocked(prisma.client.findMany).mockResolvedValue([mockClients[0]])
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoicesWithCancelled as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.clients[0].totalRevenue).toBe(1000)
    expect(data.clients[0].invoiceCount).toBe(1)
  })

  it('calculates outstanding revenue correctly', async () => {
    const invoices = [
      {
        id: 'inv-1',
        amount: 1000,
        status: 'paid',
        dueDate: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'inv-2',
        amount: 300,
        status: 'pending',
        dueDate: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'inv-3',
        amount: 200,
        status: 'overdue',
        dueDate: new Date(),
        createdAt: new Date(),
      },
    ]

    vi.mocked(prisma.client.findMany).mockResolvedValue([mockClients[0]])
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(invoices as never)

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.clients[0].totalRevenue).toBe(1500)
    expect(data.clients[0].paidRevenue).toBe(1000)
    expect(data.clients[0].outstandingRevenue).toBe(500)
  })
})
