import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Decimal } from '@prisma/client/runtime/library'

vi.mock('../../../../_lib/authz', () => ({
  requireScope: vi.fn(),
  RoutesBForbiddenError: class RoutesBForbiddenError extends Error {
    code = 'FORBIDDEN'
    status = 403
  },
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: { findFirst: vi.fn() },
    invoiceAllocation: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}))

import { requireScope, RoutesBForbiddenError } from '../../../../_lib/authz'
import { prisma } from '@/lib/db'
import { GET, POST } from '../route'

const mockedRequireScope = vi.mocked(requireScope)
const invoiceDelegate = prisma.invoice as unknown as {
  findFirst: ReturnType<typeof vi.fn>
}
const allocationDelegate = prisma.invoiceAllocation as unknown as {
  findMany: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
}
const userDelegate = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>
}

const AUTH = { userId: 'user-1', role: 'freelancer', scopes: ['routes-b:read'] }
const INVOICE_ID = crypto.randomUUID()
const BASE_URL = `http://localhost/api/routes-b/invoices/${INVOICE_ID}/allocations`

function makeGet(authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

function makePost(body: unknown, authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: authHeader
      ? { authorization: authHeader, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/routes-b/invoices/[id]/allocations', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequireScope.mockRejectedValue(
      new RoutesBForbiddenError('missing')
    )
    const res = await GET(makeGet(null), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice does not exist', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue(null)
    const res = await GET(makeGet(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(404)
  })

  it('returns 404 when invoice belongs to another user', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue(null)
    const res = await GET(makeGet(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(404)
    expect(invoiceDelegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID, userId: 'user-1' },
      })
    )
  })

  it('returns an empty list when invoice has no allocations', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({ id: INVOICE_ID })
    allocationDelegate.findMany.mockResolvedValue([])
    const res = await GET(makeGet(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.allocations).toEqual([])
  })

  it('returns allocations in descending createdAt order', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({ id: INVOICE_ID })
    const allocation = {
      id: 'alloc-1',
      amount: new Decimal('100.00'),
      allocationType: 'subcontractor',
      recipientId: 'user-2',
      recipientName: 'John Doe',
      description: 'Design work',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }
    allocationDelegate.findMany.mockResolvedValue([allocation])
    const res = await GET(makeGet(), { params: { id: INVOICE_ID } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.allocations).toHaveLength(1)
    expect(body.allocations[0]).toMatchObject({
      id: 'alloc-1',
      allocationType: 'subcontractor',
    })
    expect(allocationDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoiceId: INVOICE_ID },
        orderBy: { createdAt: 'desc' },
      })
    )
  })
})

describe('POST /api/routes-b/invoices/[id]/allocations', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequireScope.mockRejectedValue(
      new RoutesBForbiddenError('missing')
    )
    const res = await POST(
      makePost({
        amount: 100,
        allocationType: 'subcontractor',
        description: 'Test',
      }, null),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const req = new NextRequest(BASE_URL, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: 'invalid json{',
    })
    const res = await POST(req, { params: { id: INVOICE_ID } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toBe('Invalid JSON body')
  })

  it('returns 400 for missing required fields', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await POST(
      makePost({ amount: 100 }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.message).toBe('Validation failed')
    expect(body.error.details.fields).toBeDefined()
  })

  it('returns 400 for negative amount', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await POST(
      makePost({
        amount: -50,
        allocationType: 'expense',
        description: 'Test',
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid allocation type', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await POST(
      makePost({
        amount: 100,
        allocationType: 'invalid_type',
        description: 'Test',
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when invoice does not exist', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue(null)
    const res = await POST(
      makePost({
        amount: 100,
        allocationType: 'subcontractor',
        description: 'Test',
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when recipientId does not exist', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      amount: new Decimal('1000.00'),
    })
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await POST(
      makePost({
        amount: 100,
        allocationType: 'subcontractor',
        recipientId: 'non-existent-user',
        description: 'Test',
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toBe('Recipient user not found')
  })

  it('returns 400 when total allocations would exceed invoice amount', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      amount: new Decimal('1000.00'),
    })
    allocationDelegate.findMany.mockResolvedValue([
      { amount: new Decimal('600.00') },
      { amount: new Decimal('300.00') },
    ])
    const res = await POST(
      makePost({
        amount: 200,
        allocationType: 'expense',
        description: 'Test',
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toBe(
      'Total allocations would exceed invoice amount'
    )
    expect(body.error.details).toMatchObject({
      invoiceAmount: '1000.00',
      currentAllocations: '900',
      requestedAmount: '200',
      exceeded: '100',
    })
  })

  it('creates allocation when total equals invoice amount', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      amount: new Decimal('1000.00'),
    })
    allocationDelegate.findMany.mockResolvedValue([
      { amount: new Decimal('600.00') },
    ])
    const newAllocation = {
      id: 'alloc-new',
      amount: new Decimal('400.00'),
      allocationType: 'expense',
      recipientId: null,
      recipientName: null,
      description: 'Materials',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }
    allocationDelegate.create.mockResolvedValue(newAllocation)

    const res = await POST(
      makePost({
        amount: 400,
        allocationType: 'expense',
        description: 'Materials',
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.allocation).toMatchObject({
      id: 'alloc-new',
      allocationType: 'expense',
    })
  })

  it('creates allocation with recipientId and recipientName', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const recipientId = crypto.randomUUID()
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      amount: new Decimal('1000.00'),
    })
    userDelegate.findUnique.mockResolvedValue({ id: recipientId })
    allocationDelegate.findMany.mockResolvedValue([])
    const newAllocation = {
      id: 'alloc-new',
      amount: new Decimal('300.00'),
      allocationType: 'subcontractor',
      recipientId,
      recipientName: 'Jane Smith',
      description: 'Frontend development',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }
    allocationDelegate.create.mockResolvedValue(newAllocation)

    const res = await POST(
      makePost({
        amount: 300,
        allocationType: 'subcontractor',
        recipientId,
        recipientName: 'Jane Smith',
        description: 'Frontend development',
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.allocation).toMatchObject({
      id: 'alloc-new',
      recipientId,
      recipientName: 'Jane Smith',
    })
    expect(allocationDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: INVOICE_ID,
          amount: 300,
          allocationType: 'subcontractor',
          recipientId,
          recipientName: 'Jane Smith',
          description: 'Frontend development',
        }),
      })
    )
  })

  it('creates allocation without recipient for other types', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    invoiceDelegate.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      amount: new Decimal('1000.00'),
    })
    allocationDelegate.findMany.mockResolvedValue([])
    const newAllocation = {
      id: 'alloc-tax',
      amount: new Decimal('150.00'),
      allocationType: 'tax',
      recipientId: null,
      recipientName: null,
      description: 'Income tax reserve',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }
    allocationDelegate.create.mockResolvedValue(newAllocation)

    const res = await POST(
      makePost({
        amount: 150,
        allocationType: 'tax',
        description: 'Income tax reserve',
      }),
      { params: { id: INVOICE_ID } }
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.allocation).toMatchObject({
      id: 'alloc-tax',
      allocationType: 'tax',
    })
  })
})
