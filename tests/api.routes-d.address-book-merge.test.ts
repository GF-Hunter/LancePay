import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const findUnique = vi.fn()
const contactFindFirst = vi.fn()
const contactFindMany = vi.fn()
const contactUpdate = vi.fn()
const contactUpdateMany = vi.fn()
const transaction = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    contact: {
      findFirst: contactFindFirst,
      findMany: contactFindMany,
      update: contactUpdate,
      updateMany: contactUpdateMany,
    },
    $transaction: transaction,
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/address-book/merge'

function makeRequest(body: unknown, withAuth = true) {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      ...(withAuth ? { authorization: 'Bearer token' } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const primaryContact = {
  id: 'c_primary',
  userId: 'user_1',
  name: 'Ada Client',
  email: 'ada@example.com',
  phone: null,
  company: 'Ada LLC',
  notes: null,
  deletedAt: null,
}

const duplicateContacts = [
  {
    id: 'c_dup1',
    userId: 'user_1',
    name: 'Ada C.',
    email: 'ada+old@example.com',
    phone: '+2348000000000',
    company: null,
    notes: null,
    deletedAt: null,
  },
  {
    id: 'c_dup2',
    userId: 'user_1',
    name: 'Ada',
    email: 'ada+alt@example.com',
    phone: null,
    company: 'Ada Limited',
    notes: 'met at conf',
    deletedAt: null,
  },
]

function authOk() {
  verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
  findUnique.mockResolvedValue({ id: 'user_1' })
}

describe('POST /api/routes-d/address-book/merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
  })

  it('returns 401 when no authorization header is present', async () => {
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(makeRequest({ primaryId: 'a', duplicateIds: ['b'] }, false))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(makeRequest({ primaryId: 'a', duplicateIds: ['b'] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when primaryId is missing', async () => {
    authOk()
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(makeRequest({ duplicateIds: ['b'] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when duplicateIds is empty', async () => {
    authOk()
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(makeRequest({ primaryId: 'a', duplicateIds: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when duplicateIds contains non-strings', async () => {
    authOk()
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(makeRequest({ primaryId: 'a', duplicateIds: ['b', 42] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when primaryId appears in duplicateIds', async () => {
    authOk()
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(makeRequest({ primaryId: 'a', duplicateIds: ['b', 'a'] }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the primary contact is not found or not owned', async () => {
    authOk()
    contactFindFirst.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(makeRequest({ primaryId: 'c_primary', duplicateIds: ['c_dup1'] }))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toMatch(/primary/i)
  })

  it('returns 404 when any duplicate is missing, deleted, or not owned', async () => {
    authOk()
    contactFindFirst.mockResolvedValue(primaryContact)
    contactFindMany.mockResolvedValue([duplicateContacts[0]]) // asked for 2, got 1
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(
      makeRequest({ primaryId: 'c_primary', duplicateIds: ['c_dup1', 'c_dup2'] }),
    )
    expect(res.status).toBe(404)
  })

  it('merges missing fields into the primary and soft-deletes duplicates', async () => {
    authOk()
    contactFindFirst.mockResolvedValue(primaryContact)
    contactFindMany.mockResolvedValue(duplicateContacts)
    contactUpdate.mockResolvedValue({
      ...primaryContact,
      phone: '+2348000000000',
      notes: 'met at conf',
    })
    contactUpdateMany.mockResolvedValue({ count: 2 })

    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(
      makeRequest({ primaryId: 'c_primary', duplicateIds: ['c_dup1', 'c_dup2'] }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mergedCount).toBe(2)
    expect(json.contact.phone).toBe('+2348000000000')

    // Gaps filled from duplicates; existing company untouched
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: 'c_primary' },
      data: { phone: '+2348000000000', notes: 'met at conf' },
    })
    // Duplicates soft-deleted, scoped to the owner
    expect(contactUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c_dup1', 'c_dup2'] }, userId: 'user_1' },
      data: { deletedAt: expect.any(Date) },
    })
    expect(transaction).toHaveBeenCalledTimes(1)
  })

  it('deduplicates repeated ids in duplicateIds', async () => {
    authOk()
    contactFindFirst.mockResolvedValue(primaryContact)
    contactFindMany.mockResolvedValue([duplicateContacts[0]])
    contactUpdate.mockResolvedValue(primaryContact)
    contactUpdateMany.mockResolvedValue({ count: 1 })

    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(
      makeRequest({ primaryId: 'c_primary', duplicateIds: ['c_dup1', 'c_dup1'] }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mergedCount).toBe(1)
  })

  it('never overwrites populated primary fields', async () => {
    authOk()
    contactFindFirst.mockResolvedValue({ ...primaryContact, phone: '+15550001111' })
    contactFindMany.mockResolvedValue(duplicateContacts)
    contactUpdate.mockResolvedValue(primaryContact)
    contactUpdateMany.mockResolvedValue({ count: 2 })

    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    await POST(makeRequest({ primaryId: 'c_primary', duplicateIds: ['c_dup1', 'c_dup2'] }))
    const updateData = contactUpdate.mock.calls[0][0].data
    expect(updateData.phone).toBeUndefined()
    expect(updateData.notes).toBe('met at conf')
  })

  it('returns 500 when the transaction fails', async () => {
    authOk()
    contactFindFirst.mockResolvedValue(primaryContact)
    contactFindMany.mockResolvedValue(duplicateContacts)
    transaction.mockRejectedValue(new Error('db down'))
    const { POST } = await import('@/app/api/routes-d/address-book/merge/route')
    const res = await POST(
      makeRequest({ primaryId: 'c_primary', duplicateIds: ['c_dup1', 'c_dup2'] }),
    )
    expect(res.status).toBe(500)
  })
})
