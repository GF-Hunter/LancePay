import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PATCH } from '../route'

vi.mock('@/lib/auth', () => ({
  verifyAuthToken: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

const mockedVerify = vi.mocked(verifyAuthToken)
const mockedUserFind = vi.mocked(prisma.user.findUnique)
const mockedInvoiceFind = vi.mocked(prisma.invoice.findUnique)
const mockedInvoiceUpdate = vi.mocked(prisma.invoice.update)

const fakeUser = { id: 'user-1', privyId: 'privy-1' }
const fakeInvoice = {
  id: 'inv-1',
  userId: 'user-1',
  status: 'pending',
  clientName: 'Alice',
  clientEmail: 'alice@example.com',
}

const params = Promise.resolve({ id: 'inv-1' })

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/routes-b/invoices/inv-1/client', {
    headers: { authorization: 'Bearer token' },
  })
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routes-b/invoices/inv-1/client', {
    method: 'PATCH',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/routes-b/invoices/[id]/client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    mockedUserFind.mockResolvedValue(fakeUser as never)
    mockedInvoiceFind.mockResolvedValue(fakeInvoice as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await GET(makeGetRequest(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    mockedInvoiceFind.mockResolvedValue(null as never)
    const res = await GET(makeGetRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user does not own invoice', async () => {
    mockedInvoiceFind.mockResolvedValue({ ...fakeInvoice, userId: 'other' } as never)
    const res = await GET(makeGetRequest(), { params })
    expect(res.status).toBe(403)
  })

  it('returns client name and email', async () => {
    const res = await GET(makeGetRequest(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.clientName).toBe('Alice')
    expect(body.clientEmail).toBe('alice@example.com')
  })
})

describe('PATCH /api/routes-b/invoices/[id]/client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy-1' } as never)
    mockedUserFind.mockResolvedValue(fakeUser as never)
    mockedInvoiceFind.mockResolvedValue(fakeInvoice as never)
    mockedInvoiceUpdate.mockResolvedValue({
      id: 'inv-1',
      clientName: 'Bob',
      clientEmail: 'bob@example.com',
      updatedAt: new Date(),
    } as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await PATCH(makePatchRequest({ clientName: 'Bob' }), { params })
    expect(res.status).toBe(401)
  })

  it('returns 422 when invoice is not pending', async () => {
    mockedInvoiceFind.mockResolvedValue({ ...fakeInvoice, status: 'paid' } as never)
    const res = await PATCH(makePatchRequest({ clientName: 'Bob' }), { params })
    expect(res.status).toBe(422)
  })

  it('returns 400 when no valid fields provided', async () => {
    const res = await PATCH(makePatchRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when clientName is empty string', async () => {
    const res = await PATCH(makePatchRequest({ clientName: '  ' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when clientName exceeds 100 characters', async () => {
    const res = await PATCH(makePatchRequest({ clientName: 'a'.repeat(101) }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when clientEmail is invalid', async () => {
    const res = await PATCH(makePatchRequest({ clientEmail: 'not-an-email' }), { params })
    expect(res.status).toBe(400)
  })

  it('updates clientName only', async () => {
    const res = await PATCH(makePatchRequest({ clientName: 'Bob' }), { params })
    expect(res.status).toBe(200)
    expect(mockedInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { clientName: 'Bob' } }),
    )
  })

  it('updates clientEmail only', async () => {
    mockedInvoiceUpdate.mockResolvedValue({
      id: 'inv-1',
      clientName: 'Alice',
      clientEmail: 'newemail@example.com',
      updatedAt: new Date(),
    } as never)
    const res = await PATCH(makePatchRequest({ clientEmail: 'newemail@example.com' }), { params })
    expect(res.status).toBe(200)
    expect(mockedInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { clientEmail: 'newemail@example.com' } }),
    )
  })

  it('updates both clientName and clientEmail', async () => {
    const res = await PATCH(
      makePatchRequest({ clientName: 'Bob', clientEmail: 'bob@example.com' }),
      { params },
    )
    expect(res.status).toBe(200)
    expect(mockedInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { clientName: 'Bob', clientEmail: 'bob@example.com' },
      }),
    )
  })
})
